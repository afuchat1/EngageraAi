/**
 * useVoiceChat — Live voice conversation pipeline for React Native.
 *
 * Pipeline:
 *   1. expo-audio records microphone audio with metering-based VAD
 *   2. Supabase STT edge function (Groq Whisper) transcribes speech → text
 *   3. Pollinations text model generates a reply (full conversation context)
 *   4. expo-speech speaks the reply aloud (native TTS, no binary file handling)
 *   5. Loop restarts automatically after speech ends
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

const STT_URL      = `${SUPABASE_URL}/functions/v1/stt`;
const POLLINATIONS = `${SUPABASE_URL}/functions/v1/pollinations`;
const GUEST_ID_KEY = 'engagera_guest_session_id';

// Metering thresholds (dBFS; negative values, closer to 0 = louder)
const SPEECH_THRESHOLD_DB = -40;  // above this = speech detected
const SILENCE_DELAY_MS    = 900;  // commit after this ms of silence (faster feel)

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
  let guestId    = '';
  try { guestId  = (await AsyncStorage.getItem(GUEST_ID_KEY)) ?? ''; } catch {}
  return {
    'Content-Type':  'application/json',
    Authorization:   `Bearer ${token}`,
    ...(guestId ? { 'x-guest-session-id': guestId } : {}),
  };
}

// Recording options optimised for Whisper STT (16 kHz mono AAC).
// isMeteringEnabled MUST be here (RecordingOptions), not in record() start
// options — expo-audio only reads metering config at recorder construction
// time. Without it the status callback never receives dBFS data, so the VAD
// never detects speech, the silence timer never fires, and commitRecording()
// is never called.
const RECORDING_OPTIONS = {
  extension:          '.m4a',
  sampleRate:         16000,
  numberOfChannels:   1,
  bitRate:            64000,
  isMeteringEnabled:  true,
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

// ─────────────────────────────────────────────────────────────────────────────
export function useVoiceChat(options: UseVoiceChatOptions = {}) {
  const { model = 'openai', system } = options;

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
  const speechSeenRef   = useRef(false);
  const historyRef      = useRef<ConversationTurn[]>([]);

  // Forward refs so mutually-recursive callbacks stay fresh without stale closures
  const fnsRef = useRef({ startListening: async () => {}, commitRecording: async () => {} });

  // ── expo-audio recorder (single instance per hook mount) ──────────────────
  // The status listener drives VAD: it fires on every metering update while
  // recording so we can detect speech start/end without polling.
  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status) => {
    if (!activeRef.current || stateRef.current !== 'listening') return;
    // expo-audio status includes a `metering` field (dBFS, negative)
    const db = (status as Record<string, unknown>).metering as number | undefined ?? -160;

    if (db > SPEECH_THRESHOLD_DB) {
      // Speech detected — cancel any pending silence commit
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      speechSeenRef.current = true;
    } else if (speechSeenRef.current && !silenceTimerRef.current) {
      // Post-speech silence — start the commit timer
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

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // ── STT via Groq Whisper edge function ─────────────────────────────────────
  const transcribe = useCallback(async (uri: string): Promise<string | null> => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? SUPABASE_ANON_KEY;

      // M4A files are MPEG-4 audio — the correct MIME type is audio/mp4.
      // The STT edge function maps content-type to a Groq Whisper file extension;
      // audio/m4a is not in its mapping so it falls back to "webm" which causes
      // Groq to reject or misprocess the file. audio/mp4 → "mp4" is correct.
      const result = await uploadAsync(STT_URL, uri, {
        httpMethod:  'POST',
        uploadType:  FileSystemUploadType.BINARY_CONTENT,
        headers: {
          'Content-Type': 'audio/mp4',
          Authorization:  `Bearer ${token}`,
        },
      });

      if (result.status !== 200) return null;
      const d = JSON.parse(result.body) as { text?: string };
      return (typeof d.text === 'string' ? d.text.trim() : '') || null;
    } catch { return null; }
  }, []);

  // ── TTS via expo-speech (native, reliable, no binary file handling) ─────────
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

  // ── Text reply via streaming ────────────────────────────────────────────────
  const getReply = useCallback(async (userText: string): Promise<void> => {
    if (!activeRef.current) return;
    setS('thinking');
    setAiReply('');

    const messages: ConversationTurn[] = [
      ...historyRef.current,
      { role: 'user', content: userText },
    ];

    let full = '';
    try {
      const headers  = await buildHeaders();
      const response = await fetch(POLLINATIONS, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ type: 'text', model, messages, system, stream: true }),
      });
      if (!response.ok || !response.body) throw new Error('LLM request failed');

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const chunk   = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
            const content = chunk.choices?.[0]?.delta?.content ?? '';
            if (content) { full += content; setAiReply(prev => prev + content); }
          } catch { /* skip malformed SSE frames */ }
        }
      }
    } catch { /* network issues — fall through */ }

    if (full) {
      const next: ConversationTurn[] = [
        ...historyRef.current,
        { role: 'user',      content: userText },
        { role: 'assistant', content: full      },
      ];
      historyRef.current = next;
      setConversationHistory(next);
    }

    if (full && activeRef.current) {
      await speakText(full);
    } else if (activeRef.current) {
      fnsRef.current.startListening();
    }
  }, [model, system, speakText, setS]);

  // ── commitRecording ─────────────────────────────────────────────────────────
  const commitRecording = useCallback(async () => {
    if (!activeRef.current || stateRef.current !== 'listening') return;
    clearSilenceTimer();
    speechSeenRef.current = false;

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri || !activeRef.current) return;

      setS('processing');
      const text = await transcribe(uri);
      try { await deleteAsync(uri, { idempotent: true }); } catch {}

      if (!activeRef.current) return;
      if (text) {
        setTranscript(text);
        await getReply(text);
      } else {
        // Nothing heard — restart listening
        fnsRef.current.startListening();
      }
    } catch {
      if (activeRef.current) fnsRef.current.startListening();
    }
  }, [recorder, clearSilenceTimer, transcribe, getReply, setS]);

  // ── startListening ──────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    setS('listening');
    clearSilenceTimer();
    speechSeenRef.current = false;

    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording failed');
      setS('idle');
      activeRef.current = false;
    }
  }, [recorder, clearSilenceTimer, setS]);

  useEffect(() => {
    fnsRef.current = { startListening, commitRecording };
  }, [startListening, commitRecording]);

  // ── beginCall ───────────────────────────────────────────────────────────────
  const beginCall = useCallback(async () => {
    setError(null);
    setS('connecting');
    setTranscript('');
    setAiReply('');
    setCallDuration(0);
    setConversationHistory([]);
    historyRef.current = [];
    activeRef.current  = true;

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

  // ── interruptSpeaking ────────────────────────────────────────────────────────
  // Stops TTS mid-sentence; speakText's onStopped callback then calls startListening.
  const interruptSpeaking = useCallback(() => {
    if (stateRef.current === 'speaking' && activeRef.current) {
      Speech.stop();
    }
  }, []);

  // ── endCall ─────────────────────────────────────────────────────────────────
  const endCall = useCallback(async () => {
    activeRef.current = false;
    clearSilenceTimer();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    Speech.stop();
    try { await recorder.stop(); } catch {}

    historyRef.current = [];
    setS('idle');
    setTranscript('');
    setAiReply('');
    setCallDuration(0);
    setConversationHistory([]);

    try { await setAudioModeAsync({ allowsRecording: false }); } catch {}
  }, [recorder, clearSilenceTimer, setS]);

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
