import { useState, useRef, useCallback } from "react";

export interface UseVoiceOptions {
  onTranscript: (text: string) => void;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
}

export function useVoice({ onTranscript, onSpeakStart, onSpeakEnd }: UseVoiceOptions) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);

  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const synthSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const startListening = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = "en-US";
    r.maxAlternatives = 1;

    r.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript.trim();
      if (transcript) onTranscript(transcript);
    };

    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);

    recognitionRef.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthSupported) return;
    window.speechSynthesis.cancel();

    const plain = text
      .replace(/```[\s\S]*?```/g, "code block")
      .replace(/`[^`]+`/g, "")
      .replace(/[#*_~[\]]/g, "")
      .replace(/https?:\/\/\S+/g, "link")
      .slice(0, 600);

    const u = new SpeechSynthesisUtterance(plain);
    u.rate = 1.05;
    u.pitch = 1.0;
    u.volume = 1.0;

    u.onstart = () => { setSpeaking(true); onSpeakStart?.(); };
    u.onend = () => { setSpeaking(false); onSpeakEnd?.(); };
    u.onerror = () => { setSpeaking(false); onSpeakEnd?.(); };

    window.speechSynthesis.speak(u);
  }, [synthSupported, onSpeakStart, onSpeakEnd]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    onSpeakEnd?.();
  }, [onSpeakEnd]);

  return {
    listening,
    speaking,
    supported,
    synthSupported,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
