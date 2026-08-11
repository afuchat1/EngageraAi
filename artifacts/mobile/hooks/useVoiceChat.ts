/**
 * useVoiceChat — Engagera live voice conversation pipeline.
 *
 * Pipeline:
 *   1. expo-audio records microphone (VAD-driven, no manual send)
 *   2. Groq Whisper (via Supabase STT edge fn) transcribes speech → text
 *   3. Groq LLM (via Supabase pollinations edge fn) generates contextual reply
 *   4. expo-speech speaks the reply aloud (native TTS)
 *   5. Loop restarts automatically after speech ends
 *
 * Features:
 *   - Engagera branded AI identity via system prompt
 *   - Recalls previous voice conversations for context
 *   - Saves each session as a persistent conversation
 *   - Silent no-speech handling — never errors on silence
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  AudioQuality,
  IOSOutputFormat,
} from 'expo-audio';
import {
  uploadAsync,
  deleteAsync,
  FileSystemUploadType,
} from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

const STT_URL        = `${SUPABASE_URL}/functions/v1/stt`;
const POLLINATIONS   = `${SUPABASE_URL}/functions/v1/pollinations`;
const CONVERSATIONS  = `${SUPABASE_URL}/functions/v1/conversations`;

// VAD thresholds
const SPEECH_THRESHOLD_DB = -40;   // dBFS: above this = speech detected
const SILENCE_DELAY_MS    = 900;   // ms of silence after speech → auto-commit
const MAX_RECORD_MS       = 8_000; // hard cap: commit (or restart) after 8 s

// Engagera AI identity — injected as system prompt on every voice turn
const ENGAGERA_SYSTEM = `You are Engagera, an advanced AI voice assistant built into the Engagera platform. You are warm, intelligent, and conversational.

Rules for voice replies:
- Keep answers concise and natural — 1 to 3 sentences for most responses
- Never use bullet points, markdown symbols, headers, numbered lists, or code blocks
- Speak naturally, as if talking to a friend
- You know your name is Engagera and will confirm it if asked
- Use the conversation history to remember what was said and give coherent, contextual replies
- If you don't know something, say so briefly and honestly
- If the user seems to be done or says goodbye, respond warmly and naturally`;

export type VoiceState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'thinking'
  | 'speaking';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface UseVoiceChatOptions {
  model?:  string;
  system?: string;
}

// ── Auth header builder ────────────────────────────────────────────────────────
async function buildHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token    = data.session?.access_token ?? SUPABASE_ANON_KEY;
  return {
    'Content-Type':  'application/json',
    Authorization:   `Bearer ${token}`,
  };
}

// Recording options tuned for Whisper STT
const RECORDING_OPTIONS = {
  extension:         '.m4a',
  sampleRate:        16000,
  numberOfChannels:  1,
  bitRate:           64000,
  isMeteringEnabled: true,
  android: {
    outputFormat: 'mpeg4' as const,
    audioEncoder: 'aac'  as const,
  },
  ios: {
    outputFormat:         IOSOutputFormat.MPEG4AAC,
    audioQuality:         AudioQuality.MAX,
    linearPCMBitDepth:    16 as const,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat:     false,
  },
  web: {} as never,
};

// ── Load up to `limit` turns from the most recent voice conversation ──────────
async function loadPreviousContext(limit = 10): Promise<ConversationTurn[]> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${CONVERSATIONS}?model=voice&limit=1`, { headers });
    if (!res.ok) return [];
    const list = await res.json() as Array<{ id: number }>;
    if (!list.length) return [];

    const msgsRes = await fetch(`${CONVERSATIONS}/${list[0].id}/messages`, { headers });
    if (!msgsRes.ok) return [];
    const msgs = await msgsRes.json() as Array<{ role: string; content: string }>;

    return msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-limit)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  } catch {
    return [];
  }
}

// ── Persist a completed voice session ─────────────────────────────────────────
async function saveVoiceConversation(turns: ConversationTurn[]): Promise<void> {
  if (turns.length < 2) return; // need at least one full exchange
  try {
    const headers = await buildHeaders();
    // Title = first user utterance, trimmed to 60 chars
    const firstUser = turns.find(t => t.role === 'user')?.content ?? 'Voice Conversation';
    const title = firstUser.length > 60 ? firstUser.slice(0, 57) + '…' : firstUser;
    await fetch(CONVERSATIONS, {
      method:  'POST',
      headers,
      body: JSON.stringify({ title, model: 'voice', messages: turns }),
    });
  } catch {
    // Save failures are silent — not critical to UX
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export function useVoiceChat(options: UseVoiceChatOptions = {}) {
  const { model = 'openai', system = ENGAGERA_SYSTEM } = options;

  const [state,               setState]               = useState<VoiceState>('idle');
  const [transcript,          setTranscript]          = useState('');
  const [aiReply,             setAiReply]             = useState('');
  const [callDuration,        setCallDuration]        = useState(0);
  const [error,               setError]               = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);

  const stateRef        = useRef<VoiceState>('idle');
  const activeRef       = useRef(false);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const maxDurTimerRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const speechSeenRef   = useRef(false);
  const historyRef      = useRef<ConversationTurn[]>([]);

  // Forward refs so mutually-recursive callbacks stay fresh
  const fnsRef = useRef({
    startListening:  async () => {},
    commitRecording: async () => {},
  });

  // ── VAD metering callback ──────────────────────────────────────────────────
  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status) => {
    if (!activeRef.current || stateRef.current !== 'listening') return;
    const db = (status as unknown as { metering?: number }).metering ?? -160;

    if (db > SPEECH_THRESHOLD_DB) {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      speechSeenRef.current = true;
    } else if (speechSeenRef.current && !silenceTimerRef.current) {
      // Post-speech silence window — commit after delay
      silenceTimerRef.current = setTimeout(() => {
        if (activeRef.current && stateRef.current === 'listening') {
          fnsRef.current.commitRecording();
        }
      }, SILENCE_DELAY_MS);
    }
  });

  const setS = useCallback((s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (maxDurTimerRef.current)  { clearTimeout(maxDurTimerRef.current);  maxDurTimerRef.current  = null; }
  }, []);

  // ── STT via Groq Whisper ───────────────────────────────────────────────────
  const transcribe = useCallback(async (uri: string): Promise<string | null> => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? SUPABASE_ANON_KEY;

      const result = await uploadAsync(STT_URL, uri, {
        httpMethod:  'POST',
        uploadType:  FileSystemUploadType.BINARY_CONTENT,
        headers: {
          'Content-Type': 'audio/mp4',
          Authorization:  `Bearer ${token}`,
        },
      });

      // Non-200 responses → surface the error only if it's a real failure
      if (result.status !== 200) {
        try {
          const body = JSON.parse(result.body) as { error?: string; detail?: string };
          const msg  = body.detail || body.error || '';
          if (msg) setError(msg);
        } catch { /* ignore */ }
        return null;
      }

      const d = JSON.parse(result.body) as { text?: string };
      return (typeof d.text === 'string' ? d.text.trim() : '') || null;
    } catch (e) {
      // Network errors — silent, just restart
      console.warn('STT error:', e);
      return null;
    }
  }, []);

  // ── TTS via expo-speech (native, branded-neutral) ─────────────────────────
  const speakText = useCallback(async (text: string): Promise<void> => {
    if (!text.trim() || !activeRef.current) return;
    setS('speaking');

    await new Promise<void>((resolve) => {
      Speech.speak(text.slice(0, 800), {
        onDone:    resolve,
        onError:   () => resolve(),
        onStopped: resolve,
        rate:  1.0,
        pitch: 1.0,
      });
    });

    if (activeRef.current) {
      setTimeout(() => { if (activeRef.current) fnsRef.current.startListening(); }, 300);
    }
  }, [setS]);

  // ── LLM reply via Groq (non-streaming) ────────────────────────────────────
  const getReply = useCallback(async (userText: string): Promise<void> => {
    if (!activeRef.current) return;
    setS('thinking');
    setAiReply('');

    const messages: ConversationTurn[] = [
      ...historyRef.current,
      { role: 'user', content: userText },
    ];

    const attempt = async (): Promise<string | null> => {
      const headers  = await buildHeaders();
      const response = await fetch(POLLINATIONS, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ type: 'text', model, messages, system, stream: false }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`LLM error ${response.status}: ${body.slice(0, 120)}`);
      }
      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content?.trim() ?? null;
    };

    let full = '';
    try {
      full = (await attempt()) ?? '';
    } catch {
      // One retry after 1 s
      try {
        await new Promise(r => setTimeout(r, 1000));
        if (!activeRef.current) return;
        full = (await attempt()) ?? '';
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : 'Reply failed';
        setError(msg);
      }
    }

    if (full) setAiReply(full);

    if (full) {
      const next: ConversationTurn[] = [
        ...historyRef.current,
        { role: 'user',      content: userText },
        { role: 'assistant', content: full      },
      ];
      historyRef.current = next;
      setConversationHistory([...next]);
    }

    if (full && activeRef.current) {
      await speakText(full);
    } else if (activeRef.current) {
      fnsRef.current.startListening();
    }
  }, [model, system, speakText, setS]);

  // ── commitRecording ────────────────────────────────────────────────────────
  const commitRecording = useCallback(async () => {
    if (!activeRef.current || stateRef.current !== 'listening') return;
    clearTimers();
    speechSeenRef.current = false;

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri || !activeRef.current) return;

      setError(null);
      setS('processing');
      const text = await transcribe(uri);
      try { await deleteAsync(uri, { idempotent: true }); } catch {}

      if (!activeRef.current) return;

      if (text) {
        setTranscript(text);
        await getReply(text);
      } else {
        // No speech detected or empty — silently restart, no error shown
        setTimeout(() => { if (activeRef.current) fnsRef.current.startListening(); }, 600);
      }
    } catch {
      if (activeRef.current) fnsRef.current.startListening();
    }
  }, [recorder, clearTimers, transcribe, getReply, setS]);

  // ── startListening ─────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    setS('listening');
    clearTimers();
    speechSeenRef.current = false;

    try {
      await recorder.prepareToRecordAsync();
      recorder.record();

      // Safety cap — if no speech seen, restart silently; if speech seen, commit
      maxDurTimerRef.current = setTimeout(() => {
        if (!activeRef.current || stateRef.current !== 'listening') return;
        if (!speechSeenRef.current) {
          // Pure silence window — restart quietly without hitting STT
          fnsRef.current.startListening();
        } else {
          fnsRef.current.commitRecording();
        }
      }, MAX_RECORD_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording failed');
      setS('idle');
      activeRef.current = false;
    }
  }, [recorder, clearTimers, setS]);

  useEffect(() => {
    fnsRef.current = { startListening, commitRecording };
  }, [startListening, commitRecording]);

  // ── beginCall ──────────────────────────────────────────────────────────────
  const beginCall = useCallback(async () => {
    setError(null);
    setS('connecting');
    setTranscript('');
    setAiReply('');
    setCallDuration(0);

    // Load previous voice conversation context for memory/recall
    const prevContext = await loadPreviousContext(10);
    historyRef.current = prevContext;
    setConversationHistory([...prevContext]);

    activeRef.current = true;

    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) throw new Error('Microphone permission denied. Please allow microphone access in Settings.');

      await setAudioModeAsync({
        allowsRecording:   true,
        playsInSilentMode: true,
      });

      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      await fnsRef.current.startListening();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone unavailable');
      setS('idle');
      activeRef.current = false;
    }
  }, [setS]);

  // ── interruptSpeaking ──────────────────────────────────────────────────────
  const interruptSpeaking = useCallback(() => {
    if (stateRef.current === 'speaking' && activeRef.current) {
      Speech.stop();
      // Resume listening after interrupt
      setTimeout(() => { if (activeRef.current) fnsRef.current.startListening(); }, 200);
    }
  }, []);

  // ── endCall ────────────────────────────────────────────────────────────────
  const endCall = useCallback(async () => {
    activeRef.current = false;
    clearTimers();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    Speech.stop();
    try { await recorder.stop(); } catch {}

    // Persist the conversation before clearing state
    const finalHistory = [...historyRef.current];

    historyRef.current = [];
    setS('idle');
    setTranscript('');
    setAiReply('');
    setCallDuration(0);
    setConversationHistory([]);

    try { await setAudioModeAsync({ allowsRecording: false }); } catch {}

    // Save in background — don't await
    saveVoiceConversation(finalHistory).catch(() => {});
  }, [recorder, clearTimers, setS]);

  // Cleanup on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { endCall(); }, []);

  return {
    state,
    transcript,
    aiReply,
    callDuration,
    error,
    conversationHistory,
    beginCall,
    endCall,
    interruptSpeaking,
  };
}
