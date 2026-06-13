/**
 * usePhoneVoice — AI phone-call voice system.
 *
 * STT:  MediaRecorder (raw audio) → Supabase Edge Function → Groq Whisper → transcript
 * TTS:  AI reply text → browser SpeechSynthesis (fast-fail: tries OpenAI TTS Edge Function
 *        first with 3 s timeout; after first failure uses browser voice for the session)
 *
 * No Google Speech Recognition, no browser overlay, no Google APIs.
 * Pure MediaRecorder + Web Audio VAD + Groq Whisper + SpeechSynthesis.
 *
 * Stale-closure fix: mutually-referencing functions (startRecording ↔ commitRecording)
 * are stored in actionsRef so they always call the latest version.
 */
import { useState, useRef, useCallback, useEffect } from "react";

export type PhoneState =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "thinking"
  | "speaking";

interface Options {
  onSend: (text: string) => void;
}

// Web Audio RMS thresholds (0–255 Uint8 scale after FFT)
const SPEECH_THRESHOLD   = 18;    // above → user is speaking
const SILENCE_THRESHOLD  = 12;    // below → silence
const SILENCE_DURATION_MS = 1400; // ms of silence before committing

// Supabase project Edge Function base
const SUPABASE_BASE = "https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1";
const STT_URL       = `${SUPABASE_BASE}/stt`;
const TTS_URL       = `${SUPABASE_BASE}/elevenlabs-tts`;

// ElevenLabs voice — "Rachel" (clear, neutral, professional)
const TTS_VOICE_ID  = "21m00Tcm4TlvDq8ikWAM";

// ── Helpers ──────────────────────────────────────────────────────────────────
function bestMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm"))              return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus"))   return "audio/ogg;codecs=opus";
  return "";
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "code block.")
    .replace(/`[^`]+`/g, "")
    .replace(/[#*_~[\]()>]/g, "")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, 900);
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function usePhoneVoice({ onSend }: Options) {
  const [state, setState]               = useState<PhoneState>("idle");
  const [transcript, setTranscript]     = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [whisperReady, setWhisperReady] = useState(true);

  // Live refs — no re-render triggers
  const stateRef   = useRef<PhoneState>("idle");
  const activeRef  = useRef(false);
  const onSendRef  = useRef(onSend);
  useEffect(() => { onSendRef.current = onSend; }, [onSend]);

  // Audio infrastructure
  const streamRef   = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Timers
  const vadIntervalRef  = useRef<ReturnType<typeof setInterval>  | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout>   | null>(null);
  const callTimerRef    = useRef<ReturnType<typeof setInterval>  | null>(null);

  // VAD flags
  const speechDetectedRef = useRef(false);
  const hasAudioRef       = useRef(false);

  // TTS audio source — so we can cancel mid-speech
  const ttsSourceRef    = useRef<AudioBufferSourceNode | null>(null);
  // Fast-fail flag — set to false after first TTS Edge Function failure
  // so subsequent calls skip straight to browser SpeechSynthesis
  const ttsAvailableRef = useRef(true);

  // Actions table — breaks the mutual-recursion cycle between startRecording / commitRecording
  const actionsRef = useRef({ startRecording: () => {}, commitRecording: () => {} });

  // ── Shared state setter ─────────────────────────────────────────────────────
  const setStateBoth = useCallback((s: PhoneState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const clearVAD = useCallback(() => {
    if (vadIntervalRef.current)  { clearInterval(vadIntervalRef.current);  vadIntervalRef.current  = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current);  silenceTimerRef.current = null; }
  }, []);

  // ── STT — Groq Whisper via Supabase Edge Function ─────────────────────────
  const transcribeAudio = useCallback(async (blob: Blob): Promise<string | null> => {
    if (blob.size < 500) return null;
    try {
      const res = await fetch(STT_URL, {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      if (res.status === 503) {
        setWhisperReady(false);
        setTimeout(() => setWhisperReady(true), 10_000);
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json() as Record<string, unknown>;
      return (typeof data.text === "string" ? data.text.trim() : "") || null;
    } catch {
      return null;
    }
  }, []);

  // ── TTS helpers ──────────────────────────────────────────────────────────────
  const speakViaBrowser = useCallback((plain: string, onDone: () => void) => {
    if (!("speechSynthesis" in window)) { onDone(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain);
    u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = [
      "Microsoft Aria Online (Natural) - English (United States)",
      "Microsoft Jenny Online (Natural) - English (United States)",
      "Samantha", "Karen", "Google UK English Female",
    ];
    const voice = preferred.map(n => voices.find(v => v.name === n)).find(Boolean) ??
      voices.find(v => v.lang.startsWith("en")) ?? null;
    if (voice) u.voice = voice;
    u.onend  = () => onDone();
    u.onerror = () => onDone();
    window.speechSynthesis.speak(u);
  }, []);

  // ── TTS — Edge Function (OpenAI TTS) with fast-fail + 3 s timeout ───────────
  const speakText = useCallback(async (text: string, onDone: () => void) => {
    const plain = stripMarkdown(text);
    if (!plain) { onDone(); return; }

    // Cancel any in-progress speech
    ttsSourceRef.current?.stop();
    ttsSourceRef.current = null;

    // If the Edge Function already failed this session, skip straight to browser TTS
    if (!ttsAvailableRef.current) {
      speakViaBrowser(plain, onDone);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch(TTS_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text: plain, voice_id: TTS_VOICE_ID }),
        signal:  controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`TTS ${res.status}`);

      const mp3 = await res.arrayBuffer();
      const ctx  = audioCtxRef.current;
      if (!ctx || !activeRef.current) { onDone(); return; }

      const audioBuf = await ctx.decodeAudioData(mp3);
      if (!activeRef.current) { onDone(); return; }

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(ctx.destination);
      ttsSourceRef.current = source;
      source.onended = () => { ttsSourceRef.current = null; onDone(); };
      source.start();
    } catch {
      clearTimeout(timeout);
      // Mark TTS Edge Function as unavailable for this session
      ttsAvailableRef.current = false;
      speakViaBrowser(plain, onDone);
    }
  }, [speakViaBrowser]);

  // ── commitRecording — stop recorder + transcribe ────────────────────────────
  const commitRecording = useCallback(() => {
    if (!activeRef.current || stateRef.current !== "listening") return;
    clearVAD();
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    recorder.onstop = async () => {
      if (!activeRef.current) return;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];

      if (blob.size < 500) { actionsRef.current.startRecording(); return; }

      setStateBoth("processing");
      const text = await transcribeAudio(blob);
      if (!activeRef.current) return;

      if (text) {
        setTranscript(text);
        setStateBoth("thinking");
        onSendRef.current(text);
        // next state transition triggered by speakResponse() when AI replies
      } else {
        actionsRef.current.startRecording();
      }
    };

    try { recorder.stop(); } catch {}
  }, [clearVAD, transcribeAudio, setStateBoth]);

  // ── startRecording — init recorder + VAD ───────────────────────────────────
  const startRecording = useCallback(() => {
    if (!activeRef.current || !streamRef.current) return;

    setStateBoth("listening");
    chunksRef.current       = [];
    speechDetectedRef.current = false;
    hasAudioRef.current       = false;

    const mime     = bestMimeType();
    const recorder = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : {});
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) { chunksRef.current.push(e.data); hasAudioRef.current = true; }
    };
    recorder.start(200);

    const analyser = analyserRef.current;
    if (!analyser) return;
    const dataArr = new Uint8Array(analyser.frequencyBinCount);

    vadIntervalRef.current = setInterval(() => {
      if (!activeRef.current || stateRef.current !== "listening") return;
      analyser.getByteFrequencyData(dataArr);
      const rms = dataArr.reduce((s, v) => s + v, 0) / dataArr.length;

      if (rms > SPEECH_THRESHOLD) {
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        speechDetectedRef.current = true;
      } else if (speechDetectedRef.current && rms < SILENCE_THRESHOLD && !silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          if (activeRef.current && stateRef.current === "listening" && hasAudioRef.current) {
            actionsRef.current.commitRecording();
          }
        }, SILENCE_DURATION_MS);
      }
    }, 80);
  }, [setStateBoth]);

  // Keep actionsRef up to date on every render
  useEffect(() => {
    actionsRef.current = { startRecording, commitRecording };
  }, [startRecording, commitRecording]);

  // ── speakResponse — called by the page when the AI has replied ─────────────
  const speakResponse = useCallback((text: string) => {
    if (!activeRef.current) return;
    setStateBoth("speaking");
    setTranscript("");
    ttsSourceRef.current?.stop();
    ttsSourceRef.current = null;

    speakText(text, () => {
      if (!activeRef.current) return;
      actionsRef.current.startRecording();
    });
  }, [setStateBoth, speakText]);

  // ── startCall ───────────────────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    setStateBoth("connecting");
    setTranscript("");
    setCallDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000 },
      });
      if (!activeRef.current) { stream.getTracks().forEach(t => t.stop()); return; }

      streamRef.current = stream;

      // AudioContext for both VAD (analyser) and TTS playback (destination)
      const ctx      = new AudioContext();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      actionsRef.current.startRecording();
    } catch (err) {
      console.error("Mic error:", String(err));
      setStateBoth("idle");
    }
  }, [setStateBoth]);

  // ── endCall ────────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    activeRef.current = false;
    clearVAD();

    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }

    ttsSourceRef.current?.stop();
    ttsSourceRef.current = null;

    try { recorderRef.current?.stop(); } catch {}
    window.speechSynthesis?.cancel();

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current  = null;
    recorderRef.current = null;
    chunksRef.current   = [];

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;

    setStateBoth("idle");
    setTranscript("");
    setCallDuration(0);
  }, [clearVAD, setStateBoth]);

  const beginCall = useCallback(() => {
    activeRef.current = true;
    startCall();
  }, [startCall]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      endCall();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    transcript,
    callDuration,
    whisperReady,
    beginCall,
    endCall,
    speakResponse,
    supported:
      typeof navigator !== "undefined" &&
      "mediaDevices" in navigator &&
      "getUserMedia" in navigator.mediaDevices,
  };
}
