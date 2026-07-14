/**
 * usePhoneVoice — AI phone-call voice system.
 *
 * STT: MediaRecorder → Groq Whisper (Supabase Edge Function)
 * TTS: Browser SpeechSynthesis — voices pre-loaded on mount via onvoiceschanged
 *      and primed inside the beginCall() user-gesture context so Chrome allows
 *      subsequent async speak() calls without silently failing.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { supabase, SUPABASE_ANON_KEY } from "@/lib/supabase";

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

const SPEECH_THRESHOLD    = 18;
const SILENCE_THRESHOLD   = 12;
const SILENCE_DURATION_MS = 1400;

const STT_URL = "https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/stt";

// Preferred TTS voices in order; falls back to any English voice
const PREFERRED_VOICES = [
  "Google US English",
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Samantha", "Karen", "Alex",
  "Google UK English Female",
];

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

export function usePhoneVoice({ onSend }: Options) {
  const [state, setState]               = useState<PhoneState>("idle");
  const [transcript, setTranscript]     = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [whisperReady, setWhisperReady] = useState(true);

  const stateRef  = useRef<PhoneState>("idle");
  const activeRef = useRef(false);
  const onSendRef = useRef(onSend);
  useEffect(() => { onSendRef.current = onSend; }, [onSend]);

  const streamRef   = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const vadIntervalRef  = useRef<ReturnType<typeof setInterval>  | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout>   | null>(null);
  const callTimerRef    = useRef<ReturnType<typeof setInterval>  | null>(null);

  const speechDetectedRef = useRef(false);
  const hasAudioRef       = useRef(false);

  // Cached voices — populated eagerly so speak() never races with async load
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Mutual-recursion table
  const actionsRef = useRef({ startRecording: () => {}, commitRecording: () => {} });

  // ── Pre-load voices on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) voicesRef.current = v;
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const setStateBoth = useCallback((s: PhoneState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const clearVAD = useCallback(() => {
    if (vadIntervalRef.current)  { clearInterval(vadIntervalRef.current);  vadIntervalRef.current  = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current);  silenceTimerRef.current = null; }
  }, []);

  // ── STT — Groq Whisper via Edge Function ─────────────────────────────────
  const transcribeAudio = useCallback(async (blob: Blob): Promise<string | null> => {
    if (blob.size < 500) return null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? SUPABASE_ANON_KEY;
      const res = await fetch(STT_URL, {
        method:  "POST",
        headers: {
          "Content-Type": blob.type || "audio/webm",
          "Authorization": `Bearer ${token}`,
        },
        body:    blob,
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

  // ── TTS — Browser SpeechSynthesis ─────────────────────────────────────────
  //
  // Chrome fix: getVoices() returns [] on first call (async load). We cache
  // voices in voicesRef via onvoiceschanged above. We also prime the API inside
  // beginCall() which runs within the user gesture, satisfying Chrome's autoplay
  // policy for subsequent async speak() calls.
  const speakText = useCallback((text: string, onDone: () => void) => {
    const plain = stripMarkdown(text);
    if (!plain) { onDone(); return; }
    if (!("speechSynthesis" in window)) { onDone(); return; }

    window.speechSynthesis.cancel();

    const doSpeak = () => {
      const u = new SpeechSynthesisUtterance(plain);
      u.rate   = 1.0;
      u.pitch  = 1.0;
      u.volume = 1.0;
      u.lang   = "en-US";

      const voices = voicesRef.current.length > 0
        ? voicesRef.current
        : window.speechSynthesis.getVoices();
      const voice =
        PREFERRED_VOICES.map(n => voices.find(v => v.name === n)).find(Boolean) ??
        voices.find(v => v.lang.startsWith("en") && !v.localService) ??
        voices.find(v => v.lang.startsWith("en")) ??
        null;
      if (voice) u.voice = voice;

      u.onend   = () => { if (activeRef.current) onDone(); };
      u.onerror = (e) => {
        // "interrupted" is expected when we cancel() before next utterance — not an error
        if ((e as SpeechSynthesisErrorEvent).error !== "interrupted") {
          if (activeRef.current) onDone();
        }
      };

      window.speechSynthesis.speak(u);
    };

    // Voices already loaded → speak immediately
    if (voicesRef.current.length > 0 || window.speechSynthesis.getVoices().length > 0) {
      doSpeak();
    } else {
      // Wait for Chrome's async voice load
      const prev = window.speechSynthesis.onvoiceschanged;
      window.speechSynthesis.onvoiceschanged = () => {
        voicesRef.current = window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = prev ?? null;
        doSpeak();
      };
      // Safety fallback: speak anyway after 500 ms even if event never fires
      setTimeout(doSpeak, 500);
    }
  }, []);

  // ── commitRecording ────────────────────────────────────────────────────────
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
      } else {
        actionsRef.current.startRecording();
      }
    };

    try { recorder.stop(); } catch {}
  }, [clearVAD, transcribeAudio, setStateBoth]);

  // ── startRecording ─────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!activeRef.current || !streamRef.current) return;

    setStateBoth("listening");
    chunksRef.current         = [];
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

  useEffect(() => {
    actionsRef.current = { startRecording, commitRecording };
  }, [startRecording, commitRecording]);

  // ── speakResponse — called from the page when AI replies ──────────────────
  const speakResponse = useCallback((text: string) => {
    if (!activeRef.current) return;
    setStateBoth("speaking");
    setTranscript("");

    speakText(text, () => {
      if (!activeRef.current) return;
      // Brief pause so mic doesn't pick up TTS echo
      setTimeout(() => {
        if (activeRef.current) actionsRef.current.startRecording();
      }, 300);
    });
  }, [setStateBoth, speakText]);

  // ── startCall ──────────────────────────────────────────────────────────────
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

    window.speechSynthesis?.cancel();

    try { recorderRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current   = null;
    recorderRef.current = null;
    chunksRef.current   = [];

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;

    setStateBoth("idle");
    setTranscript("");
    setCallDuration(0);
  }, [clearVAD, setStateBoth]);

  // ── beginCall — must run in user gesture context ──────────────────────────
  const beginCall = useCallback(() => {
    // Prime speechSynthesis INSIDE the user gesture so Chrome grants audio
    // permission for all subsequent async speak() calls this session.
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();          // clear any queue
      window.speechSynthesis.getVoices();       // trigger async voice load
    }
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
