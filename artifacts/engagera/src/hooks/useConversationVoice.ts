import { useState, useRef, useCallback } from "react";

export type ConvVoiceState = "idle" | "listening" | "thinking" | "speaking";

interface Options {
  onSend: (text: string) => void;
}

export function useConversationVoice({ onSend }: Options) {
  const [state, setState] = useState<ConvVoiceState>("idle");
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const stateRef = useRef<ConvVoiceState>("idle");
  const accumulatedRef = useRef("");

  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const setStateBoth = (s: ConvVoiceState) => {
    stateRef.current = s;
    setState(s);
  };

  const clearTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const doSend = useCallback((text: string) => {
    if (!text.trim() || !activeRef.current) return;
    clearTimer();
    try { recognitionRef.current?.stop(); } catch {}
    setStateBoth("thinking");
    setInterimText("");
    setFinalText("");
    accumulatedRef.current = "";
    onSend(text.trim());
  }, [onSend]);

  const startRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR || !activeRef.current) return;

    accumulatedRef.current = "";
    setInterimText("");
    setFinalText("");
    setStateBoth("listening");

    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.maxAlternatives = 1;

    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          accumulatedRef.current += e.results[i][0].transcript + " ";
          setFinalText(accumulatedRef.current.trim());
          // restart silence timer each time we get a final chunk
          clearTimer();
          silenceTimerRef.current = setTimeout(() => {
            doSend(accumulatedRef.current);
          }, 1400);
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setInterimText(interim);
    };

    r.onspeechend = () => {
      // Speech paused — accelerate send if we have text
      if (accumulatedRef.current.trim()) {
        clearTimer();
        silenceTimerRef.current = setTimeout(() => {
          doSend(accumulatedRef.current);
        }, 600);
      }
    };

    r.onend = () => {
      // If still listening mode and no send scheduled, restart
      if (activeRef.current && stateRef.current === "listening") {
        setTimeout(() => {
          if (activeRef.current && stateRef.current === "listening") {
            startRecognition();
          }
        }, 200);
      }
    };

    r.onerror = (e: any) => {
      if (!activeRef.current) return;
      if (e.error === "no-speech" || e.error === "aborted") {
        setTimeout(() => {
          if (activeRef.current && stateRef.current === "listening") startRecognition();
        }, 300);
      }
    };

    recognitionRef.current = r;
    try {
      r.start();
    } catch {
      // already started
    }
  }, [doSend]);

  // Called by the page after AI reply arrives
  const speakResponse = useCallback((text: string) => {
    if (!activeRef.current) return;
    if (!("speechSynthesis" in window)) {
      startRecognition();
      return;
    }

    setStateBoth("speaking");
    window.speechSynthesis.cancel();

    const plain = text
      .replace(/```[\s\S]*?```/g, "code block")
      .replace(/`[^`]+`/g, "")
      .replace(/[#*_~[\]()>]/g, "")
      .replace(/https?:\/\/\S+/g, "link")
      .replace(/\n+/g, " ")
      .trim()
      .slice(0, 900);

    if (!plain) {
      if (activeRef.current) startRecognition();
      return;
    }

    const u = new SpeechSynthesisUtterance(plain);
    u.rate = 1.05;
    u.pitch = 1.0;
    u.volume = 1.0;

    // Pick a natural-sounding voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Alex") || v.name.includes("Daniel"))
    );
    if (preferred) u.voice = preferred;

    u.onend = () => {
      if (activeRef.current) startRecognition();
      else setStateBoth("idle");
    };
    u.onerror = () => {
      if (activeRef.current) startRecognition();
      else setStateBoth("idle");
    };

    window.speechSynthesis.speak(u);
  }, [startRecognition]);

  const startConversation = useCallback(() => {
    activeRef.current = true;
    window.speechSynthesis?.cancel();
    clearTimer();
    startRecognition();
  }, [startRecognition]);

  const stopConversation = useCallback(() => {
    activeRef.current = false;
    clearTimer();
    try { recognitionRef.current?.stop(); } catch {}
    window.speechSynthesis?.cancel();
    setStateBoth("idle");
    setInterimText("");
    setFinalText("");
    accumulatedRef.current = "";
  }, []);

  return {
    state,
    interimText,
    finalText,
    supported,
    startConversation,
    stopConversation,
    speakResponse,
  };
}
