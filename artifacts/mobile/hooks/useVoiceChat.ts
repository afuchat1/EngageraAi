/**
 * useVoiceChat — Live voice conversation pipeline for React Native.
 *
 * Pipeline:
 *   1. expo-av records microphone audio with metering-based VAD
 *   2. Supabase STT edge function (Groq Whisper) transcribes speech → text
 *   3. Pollinations text model generates a reply (full conversation context)
 *   4. expo-speech speaks the reply aloud (native TTS, no binary file handling)
 *   5. Loop restarts automatically after speech ends
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
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

// Metering thresholds (dBFS from expo-av; negative values, closer to 0 = louder)
const SPEECH_THRESHOLD_DB = -40;   // above this level = speech detected
const SILENCE_DELAY_MS    = 1400;  // commit after this ms of silence post-speech

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
  const recordingRef    = useRef<Audio.Recording | null>(null);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const speechSeenRef   = useRef(false);
  const historyRef      = useRef<ConversationTurn[]>([]);

  // Forward refs so mutually-recursive callbacks stay fresh without stale closures
  const fnsRef = useRef({ startListening: async () => {}, commitRecording: async () => {} });

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

      const result = await uploadAsync(STT_URL, uri, {
        httpMethod:  'POST',
        uploadType:  FileSystemUploadType.BINARY_CONTENT,
        headers: {
          'Content-Type': 'audio/m4a',
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
        onDone:  resolve,
        onError: () => resolve(),
        onStopped: resolve,
        rate: 1.0,
        pitch: 1.0,
      });
    });

    if (activeRef.current) {
      setTimeout(() => { if (activeRef.current) fnsRef.current.startListening(); }, 300);
    }
  }, [setS]);

  // ── Pollinations text reply ─────────────────────────────────────────────────
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

    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri || !activeRef.current) return;

      setS('processing');
      const text = await transcribe(uri);
      try { await deleteAsync(uri, { idempotent: true }); } catch {}

      if (!activeRef.current) return;
      if (text) {
        setTranscript(text);
        await getReply(text);
      } else {
        // Nothing usable heard — restart listening
        fnsRef.current.startListening();
      }
    } catch {
      if (activeRef.current) fnsRef.current.startListening();
    }
  }, [clearSilenceTimer, transcribe, getReply, setS]);

  // ── startListening ──────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    setS('listening');
    clearSilenceTimer();
    speechSeenRef.current = false;

    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        isMeteringEnabled: true,
        android: {
          extension:        '.m4a',
          outputFormat:     2,   // MPEG_4
          audioEncoder:     3,   // AAC
          sampleRate:       16000,
          numberOfChannels: 1,
          bitRate:          64000,
        },
        ios: {
          extension:            '.m4a',
          outputFormat:         'aac ' as unknown as number,
          audioQuality:         0x7F, // MAX
          sampleRate:           16000,
          numberOfChannels:     1,
          bitRate:              64000,
          linearPCMBitDepth:    16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat:     false,
        },
        web: {} as never,
      });

      recording.setOnRecordingStatusUpdate((status) => {
        if (!activeRef.current || stateRef.current !== 'listening') return;
        if (!status.isRecording) return;

        const db = status.metering ?? -160;

        if (db > SPEECH_THRESHOLD_DB) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          speechSeenRef.current = true;
        } else if (speechSeenRef.current && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            if (activeRef.current && stateRef.current === 'listening') {
              fnsRef.current.commitRecording();
            }
          }, SILENCE_DELAY_MS);
        }
      });

      recordingRef.current = recording;
      await recording.startAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording failed');
      setS('idle');
      activeRef.current = false;
    }
  }, [clearSilenceTimer, setS]);

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
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) throw new Error('Microphone permission denied. Please allow microphone access in Settings.');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:   true,
        playsInSilentModeIOS: true,
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
  // Stops TTS mid-sentence and immediately returns to listening.
  // The speakText promise resolves via onStopped → startListening is called automatically.
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

    try { await recordingRef.current?.stopAndUnloadAsync(); } catch {}
    recordingRef.current = null;

    historyRef.current = [];
    setS('idle');
    setTranscript('');
    setAiReply('');
    setCallDuration(0);
    setConversationHistory([]);

    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch {}
  }, [clearSilenceTimer, setS]);

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
