/**
 * usePollinationsVoice — Real-time voice conversation
 *
 * Pipeline:
 *   1. MediaRecorder captures microphone audio (VAD-triggered)
 *   2. Groq Whisper edge function transcribes speech → text
 *   3. Pollinations text model generates a reply (full conversation context)
 *   4. Pollinations TTS converts reply → MP3 → plays back
 *   5. Loop restarts after playback ends
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { buildPollinationsHeaders, POLLINATIONS_FN } from "@/hooks/usePollinations";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "thinking"
  | "speaking";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface UsePollinationsVoiceOptions {
  model?:  string;  // Pollinations text model (default: "openai")
  voice?:  string;  // TTS voice (default: "nova")
  system?: string;  // Optional system prompt
}

const STT_URL          = `${SUPABASE_URL}/functions/v1/stt`;
const SPEECH_THRESHOLD = 18;
const SILENCE_THRESH   = 12;
const SILENCE_DELAY_MS = 1400;

function bestMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm"))             return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus"))  return "audio/ogg;codecs=opus";
  return "";
}

export function usePollinationsVoice(options: UsePollinationsVoiceOptions = {}) {
  const { model = "openai", voice = "nova", system } = options;

  const [state,               setState]               = useState<VoiceState>("idle");
  const [transcript,          setTranscript]          = useState("");
  const [aiReply,             setAiReply]             = useState("");
  const [callDuration,        setCallDuration]        = useState(0);
  const [error,               setError]               = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);

  const activeRef      = useRef(false);
  const stateRef       = useRef<VoiceState>("idle");
  const streamRef      = useRef<MediaStream | null>(null);
  const recorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const vadRef         = useRef<ReturnType<typeof setInterval>  | null>(null);
  const silRef         = useRef<ReturnType<typeof setTimeout>   | null>(null);
  const timerRef       = useRef<ReturnType<typeof setInterval>  | null>(null);
  const audioElRef     = useRef<HTMLAudioElement | null>(null);
  const speechSeen     = useRef(false);
  const hasAudio       = useRef(false);
  // Full multi-turn conversation history kept in a ref for synchronous access
  const historyRef     = useRef<ConversationTurn[]>([]);

  // Forward refs so mutually-recursive callbacks stay fresh
  const fnsRef = useRef({ startRec: () => {}, commitRec: () => {} });

  const setS = useCallback((s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const clearVAD = useCallback(() => {
    if (vadRef.current) { clearInterval(vadRef.current);  vadRef.current = null; }
    if (silRef.current) { clearTimeout(silRef.current);   silRef.current = null; }
  }, []);

  // ── STT via Groq Whisper ────────────────────────────────────────────────────
  const transcribe = useCallback(async (blob: Blob): Promise<string | null> => {
    if (blob.size < 500) return null;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? SUPABASE_ANON_KEY;
      const res = await fetch(STT_URL, {
        method:  "POST",
        headers: { "Content-Type": blob.type || "audio/webm", "Authorization": `Bearer ${token}` },
        body:    blob,
      });
      if (!res.ok) return null;
      const d = await res.json() as { text?: string };
      return (typeof d.text === "string" ? d.text.trim() : "") || null;
    } catch { return null; }
  }, []);

  // ── Pollinations TTS → playback ─────────────────────────────────────────────
  const speakText = useCallback(async (text: string, onDone: () => void): Promise<void> => {
    if (!text.trim() || !activeRef.current) { onDone(); return; }
    try {
      setS("speaking");
      const headers = await buildPollinationsHeaders();
      const res = await fetch(POLLINATIONS_FN, {
        method:  "POST",
        headers,
        body:    JSON.stringify({ type: "audio", text: text.slice(0, 800), voice }),
      });
      if (!res.ok || !activeRef.current) { onDone(); return; }
      const buf   = await res.arrayBuffer();
      const blob  = new Blob([buf], { type: "audio/mpeg" });
      const url   = URL.createObjectURL(blob);

      if (audioElRef.current) {
        audioElRef.current.pause();
        URL.revokeObjectURL(audioElRef.current.src);
      }
      const audio = new Audio(url);
      audioElRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (activeRef.current) {
          setTimeout(() => { if (activeRef.current) fnsRef.current.startRec(); }, 300);
        }
        onDone();
      };
      audio.onerror = () => { onDone(); };
      await audio.play();
    } catch {
      onDone();
    }
  }, [voice, setS]);

  // ── Pollinations text reply (full conversation context) ─────────────────────
  const getReply = useCallback(async (userText: string): Promise<void> => {
    if (!activeRef.current) return;
    setS("thinking");
    setAiReply("");

    // Build messages including full history so the AI has context
    const messages: ConversationTurn[] = [
      ...historyRef.current,
      { role: "user", content: userText },
    ];

    let full = "";
    try {
      const headers = await buildPollinationsHeaders();
      const res = await fetch(POLLINATIONS_FN, {
        method:  "POST",
        headers,
        body:    JSON.stringify({ type: "text", model, messages, system, stream: true }),
      });
      if (!res.ok || !res.body) throw new Error("Text generation failed");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const chunk   = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
            const content = chunk.choices?.[0]?.delta?.content ?? "";
            if (content) { full += content; setAiReply(prev => prev + content); }
          } catch { /* skip */ }
        }
      }
    } catch { /* network issues */ }

    // Commit this turn to history
    if (full) {
      const nextHistory: ConversationTurn[] = [
        ...historyRef.current,
        { role: "user",      content: userText },
        { role: "assistant", content: full      },
      ];
      historyRef.current = nextHistory;
      setConversationHistory(nextHistory);
    }

    if (full && activeRef.current) {
      await speakText(full, () => {});
    } else if (activeRef.current) {
      fnsRef.current.startRec();
    }
  }, [model, system, speakText, setS]);

  // ── commitRecording ──────────────────────────────────────────────────────────
  const commitRec = useCallback(() => {
    if (!activeRef.current || stateRef.current !== "listening") return;
    clearVAD();
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;

    rec.onstop = async () => {
      if (!activeRef.current) return;
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      chunksRef.current = [];
      if (blob.size < 500) { fnsRef.current.startRec(); return; }

      setS("processing");
      const text = await transcribe(blob);
      if (!activeRef.current) return;

      if (text) {
        setTranscript(text);
        await getReply(text);
      } else {
        fnsRef.current.startRec();
      }
    };
    try { rec.stop(); } catch { /* noop */ }
  }, [clearVAD, transcribe, getReply, setS]);

  // ── startRecording ───────────────────────────────────────────────────────────
  const startRec = useCallback(() => {
    if (!activeRef.current || !streamRef.current) return;
    setS("listening");
    chunksRef.current  = [];
    speechSeen.current = false;
    hasAudio.current   = false;

    const mime = bestMime();
    const rec  = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : {});
    recorderRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) { chunksRef.current.push(e.data); hasAudio.current = true; }
    };
    rec.start(200);

    const analyser = analyserRef.current;
    if (!analyser) return;
    const arr = new Uint8Array(analyser.frequencyBinCount);

    vadRef.current = setInterval(() => {
      if (!activeRef.current || stateRef.current !== "listening") return;
      analyser.getByteFrequencyData(arr);
      const rms = arr.reduce((s, v) => s + v, 0) / arr.length;

      if (rms > SPEECH_THRESHOLD) {
        if (silRef.current) { clearTimeout(silRef.current); silRef.current = null; }
        speechSeen.current = true;
      } else if (speechSeen.current && rms < SILENCE_THRESH && !silRef.current) {
        silRef.current = setTimeout(() => {
          if (activeRef.current && stateRef.current === "listening" && hasAudio.current) {
            fnsRef.current.commitRec();
          }
        }, SILENCE_DELAY_MS);
      }
    }, 80);
  }, [setS]);

  useEffect(() => { fnsRef.current = { startRec, commitRec }; }, [startRec, commitRec]);

  // ── beginCall ────────────────────────────────────────────────────────────────
  const beginCall = useCallback(async () => {
    setError(null);
    setS("connecting");
    setTranscript("");
    setAiReply("");
    setCallDuration(0);
    setConversationHistory([]);
    historyRef.current = [];
    activeRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000 },
      });
      if (!activeRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;

      const ctx    = new AudioContext();
      const src    = ctx.createMediaStreamSource(stream);
      const an     = ctx.createAnalyser();
      an.fftSize   = 256;
      an.smoothingTimeConstant = 0.6;
      src.connect(an);
      audioCtxRef.current = ctx;
      analyserRef.current = an;

      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      fnsRef.current.startRec();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone unavailable");
      setS("idle");
      activeRef.current = false;
    }
  }, [setS]);

  // ── endCall ──────────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    activeRef.current = false;
    clearVAD();
    if (timerRef.current)    { clearInterval(timerRef.current); timerRef.current = null; }
    if (audioElRef.current)  { audioElRef.current.pause(); audioElRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    historyRef.current = [];
    setS("idle");
    setTranscript("");
    setAiReply("");
    setCallDuration(0);
    setConversationHistory([]);
  }, [clearVAD, setS]);

  useEffect(() => () => { activeRef.current = false; endCall(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const supported =
    typeof navigator !== "undefined" &&
    "mediaDevices" in navigator &&
    "getUserMedia" in navigator.mediaDevices;

  return {
    state,
    transcript,
    aiReply,
    callDuration,
    error,
    conversationHistory,
    beginCall,
    endCall,
    supported,
  };
}
