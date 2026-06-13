/**
 * usePhoneVoice — real AI phone-call voice system.
 *
 * INPUT:  MediaRecorder (raw audio) → /api/stt (Whisper) → transcript
 * OUTPUT: SpeechSynthesis with best available voice → natural spoken reply
 *
 * No Google Voice Assistant. No browser speech-recognition UI overlays.
 * Pure MediaRecorder + Web Audio API + our own STT endpoint.
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

// RMS threshold — tune if needed (0-255 scale)
const SPEECH_THRESHOLD = 18;   // above this = user is speaking
const SILENCE_THRESHOLD = 12;  // below this = silence
const SILENCE_DURATION_MS = 1400; // how long silence before we send

function pickBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();

  const ordered = [
    // Microsoft Azure neural (Windows / Edge — sound very natural)
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Microsoft Guy Online (Natural) - English (United States)",
    "Microsoft Aria Online",
    "Microsoft Jenny Online",
    // Apple Siri voices (macOS / iOS)
    "Samantha",
    "Karen",
    "Daniel",
    "Moira",
    // Google voices — decent but listed last
    "Google UK English Female",
    "Google US English",
  ];

  for (const name of ordered) {
    const v = voices.find((v) => v.name === name);
    if (v) return v;
  }

  // fallback — first English voice
  return voices.find((v) => v.lang.startsWith("en")) ?? null;
}

export function usePhoneVoice({ onSend }: Options) {
  const [state, setState] = useState<PhoneState>("idle");
  const [transcript, setTranscript] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [whisperReady, setWhisperReady] = useState(true);

  const stateRef = useRef<PhoneState>("idle");
  const activeRef = useRef(false);

  // Audio infra
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Timers
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Speech flags
  const speechDetectedRef = useRef(false);
  const hasAudioRef = useRef(false);

  const setStateBoth = useCallback((s: PhoneState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const clearVAD = useCallback(() => {
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }, []);

  // ── STT — send audio blob to our Whisper proxy ──────────────────────────────
  const transcribeAudio = useCallback(async (blob: Blob): Promise<string | null> => {
    if (blob.size < 500) return null;

    try {
      const res = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });

      if (res.status === 503) {
        // Whisper model is loading on HuggingFace — wait and retry
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        const wait = Math.max(5, Math.min(30, (data.estimated_time as number) ?? 15));
        setWhisperReady(false);
        warmupTimerRef.current = setTimeout(() => setWhisperReady(true), wait * 1000);
        return null;
      }

      if (!res.ok) return null;

      const data = await res.json() as Record<string, unknown>;
      const text = (typeof data.text === "string" ? data.text : "").trim();
      return text || null;
    } catch {
      return null;
    }
  }, []);

  // ── TTS — speak AI reply ─────────────────────────────────────────────────────
  const speakText = useCallback((text: string, onDone: () => void) => {
    if (!("speechSynthesis" in window)) { onDone(); return; }
    window.speechSynthesis.cancel();

    const plain = text
      .replace(/```[\s\S]*?```/g, "code block.")
      .replace(/`[^`]+`/g, "")
      .replace(/[#*_~[\]()>]/g, "")
      .replace(/https?:\/\/\S+/g, "link")
      .replace(/\n+/g, " ")
      .trim()
      .slice(0, 800);

    if (!plain) { onDone(); return; }

    const u = new SpeechSynthesisUtterance(plain);
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;

    // Use best available voice
    const voice = pickBestVoice();
    if (voice) u.voice = voice;

    u.onend = () => onDone();
    u.onerror = () => onDone();

    window.speechSynthesis.speak(u);
  }, []);

  // ── Stop the current recording and process it ───────────────────────────────
  const commitRecording = useCallback(() => {
    if (!activeRef.current || stateRef.current !== "listening") return;
    clearVAD();

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    recorder.onstop = async () => {
      if (!activeRef.current) return;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];

      if (blob.size < 500) {
        // Too short — restart listening
        startRecording();
        return;
      }

      setStateBoth("processing");
      const text = await transcribeAudio(blob);

      if (!activeRef.current) return;

      if (text) {
        setTranscript(text);
        setStateBoth("thinking");
        onSend(text);
        // speakResponse() will be called externally when AI responds
      } else {
        // Nothing transcribed — go back to listening
        startRecording();
      }
    };

    recorder.stop();
  }, [clearVAD, transcribeAudio, onSend, setStateBoth]);

  // ── Start recording + VAD loop ───────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!activeRef.current || !streamRef.current) return;

    setStateBoth("listening");
    chunksRef.current = [];
    speechDetectedRef.current = false;
    hasAudioRef.current = false;

    // Pick best supported mime type
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";

    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {});
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
        hasAudioRef.current = true;
      }
    };

    recorder.start(200); // collect chunks every 200ms

    // ── VAD: monitor audio levels ─────────────────────────────────────────────
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArr = new Uint8Array(analyser.frequencyBinCount);

    vadIntervalRef.current = setInterval(() => {
      if (!activeRef.current || stateRef.current !== "listening") return;
      analyser.getByteFrequencyData(dataArr);

      let sum = 0;
      for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
      const rms = sum / dataArr.length;

      if (rms > SPEECH_THRESHOLD) {
        // User is speaking — cancel silence timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        speechDetectedRef.current = true;
      } else if (speechDetectedRef.current && rms < SILENCE_THRESHOLD && !silenceTimerRef.current) {
        // Silence after speech — schedule send
        silenceTimerRef.current = setTimeout(() => {
          if (activeRef.current && stateRef.current === "listening" && hasAudioRef.current) {
            commitRecording();
          }
        }, SILENCE_DURATION_MS);
      }
    }, 80);
  }, [setStateBoth, commitRecording]);

  // ── speakResponse — called by landing.tsx after AI reply ────────────────────
  const speakResponse = useCallback((text: string) => {
    if (!activeRef.current) return;
    setStateBoth("speaking");
    setTranscript("");
    window.speechSynthesis.cancel();

    speakText(text, () => {
      if (!activeRef.current) return;
      startRecording();
    });
  }, [setStateBoth, speakText, startRecording]);

  // ── Start the call ────────────────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    setStateBoth("connecting");
    setTranscript("");
    setCallDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      if (!activeRef.current) {
        // User cancelled during permission prompt
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Web Audio for VAD
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      // Call duration timer
      callTimerRef.current = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);

      startRecording();
    } catch (err) {
      console.error("Mic error:", String(err));
      setStateBoth("idle");
    }
  }, [setStateBoth, startRecording]);

  // ── End the call ─────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    activeRef.current = false;
    clearVAD();

    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
    if (warmupTimerRef.current) { clearTimeout(warmupTimerRef.current); warmupTimerRef.current = null; }

    try { recorderRef.current?.stop(); } catch {}
    window.speechSynthesis?.cancel();

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];

    setStateBoth("idle");
    setTranscript("");
    setCallDuration(0);
  }, [clearVAD, setStateBoth]);

  // ── Public start (sets active flag first) ────────────────────────────────────
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
