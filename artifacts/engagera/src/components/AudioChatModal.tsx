/**
 * AudioChatModal — Advanced live voice conversation with Pollinations.AI
 *
 * Full-screen overlay with animated orb, real-time conversation transcript,
 * voice/model selectors, and VAD-triggered turn detection.
 */

import React, { useState, useEffect, useRef } from "react";
import { PhoneOff, Mic, X, ChevronDown, Volume2 } from "lucide-react";
import { usePollinationsVoice, type VoiceState, type ConversationTurn } from "@/hooks/usePollinationsVoice";
import { cn } from "@/lib/utils";

// ── Model options ─────────────────────────────────────────────────────────────
const MODELS = [
  { id: "openai",           label: "GPT-4o",            tag: "Pro"    },
  { id: "openai-large",     label: "GPT-4o Latest",     tag: "Pro"    },
  { id: "claude",           label: "Claude 3.7 Sonnet", tag: "Pro"    },
  { id: "claude-thinking",  label: "Claude + Thinking", tag: "Reason" },
  { id: "gemini",           label: "Gemini 2.0 Flash",  tag: "Lite"   },
  { id: "gemini-thinking",  label: "Gemini Thinking",   tag: "Reason" },
  { id: "mistral",          label: "Mistral Large",     tag: "Pro"    },
  { id: "llama",            label: "Llama 3.3 70B",     tag: "Free"   },
  { id: "deepseek",         label: "DeepSeek-V3",       tag: "Pro"    },
];

const VOICES = [
  { id: "nova",    label: "Nova",    desc: "Warm & natural"   },
  { id: "alloy",   label: "Alloy",   desc: "Balanced & clear" },
  { id: "echo",    label: "Echo",    desc: "Deep & resonant"  },
  { id: "fable",   label: "Fable",   desc: "Expressive"       },
  { id: "onyx",    label: "Onyx",    desc: "Authoritative"    },
  { id: "shimmer", label: "Shimmer", desc: "Gentle & soft"    },
];

// ── State config ──────────────────────────────────────────────────────────────
const STATE_CONFIG: Record<VoiceState, {
  label: string;
  sublabel: string;
  orbColor: string;
  ringColor: string;
  rings: number;
  pulse: boolean;
  spin: boolean;
}> = {
  idle: {
    label: "Ready",
    sublabel: "Tap the button below to start",
    orbColor: "#ffffff18",
    ringColor: "#ffffff20",
    rings: 0, pulse: false, spin: false,
  },
  connecting: {
    label: "Connecting…",
    sublabel: "Setting up microphone",
    orbColor: "#ffffff30",
    ringColor: "#ffffff25",
    rings: 1, pulse: true, spin: false,
  },
  listening: {
    label: "Listening",
    sublabel: "Speak now — I'm paying attention",
    orbColor: "#22c55e",
    ringColor: "#22c55e",
    rings: 3, pulse: true, spin: false,
  },
  processing: {
    label: "Processing",
    sublabel: "Transcribing your voice…",
    orbColor: "#3b82f6",
    ringColor: "#3b82f6",
    rings: 1, pulse: false, spin: true,
  },
  thinking: {
    label: "Thinking",
    sublabel: "Generating a response…",
    orbColor: "#a855f7",
    ringColor: "#a855f7",
    rings: 2, pulse: true, spin: false,
  },
  speaking: {
    label: "Speaking",
    sublabel: "Listen carefully",
    orbColor: "#f97316",
    ringColor: "#f97316",
    rings: 2, pulse: true, spin: false,
  },
};

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── Animated Orb ─────────────────────────────────────────────────────────────
function VoiceOrb({ state }: { state: VoiceState }) {
  const cfg = STATE_CONFIG[state];

  return (
    <>
      {/* CSS animations injected once */}
      <style>{`
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1);    opacity: 1;   }
          50%       { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes orb-ring-expand {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(2.4); opacity: 0;   }
        }
        @keyframes orb-spin {
          from { transform: rotate(0deg);   }
          to   { transform: rotate(360deg); }
        }
        @keyframes orb-glow {
          0%, 100% { box-shadow: 0 0 40px 8px var(--orb-color), 0 0 80px 20px var(--orb-color-dim); }
          50%       { box-shadow: 0 0 60px 16px var(--orb-color), 0 0 100px 30px var(--orb-color-dim); }
        }
        .orb-pulse  { animation: orb-pulse 1.8s ease-in-out infinite; }
        .orb-spin   { animation: orb-spin 1.4s linear infinite; }
        .orb-glow   { animation: orb-glow 2s ease-in-out infinite; }
        .ring-1     { animation: orb-ring-expand 2.0s ease-out infinite; }
        .ring-2     { animation: orb-ring-expand 2.0s ease-out 0.6s infinite; }
        .ring-3     { animation: orb-ring-expand 2.0s ease-out 1.2s infinite; }
      `}</style>

      <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
        {/* Expanding rings */}
        {cfg.rings >= 1 && (
          <div
            className="ring-1 absolute inset-0 rounded-full border"
            style={{ borderColor: cfg.ringColor + "80" }}
          />
        )}
        {cfg.rings >= 2 && (
          <div
            className="ring-2 absolute inset-0 rounded-full border"
            style={{ borderColor: cfg.ringColor + "60" }}
          />
        )}
        {cfg.rings >= 3 && (
          <div
            className="ring-3 absolute inset-0 rounded-full border"
            style={{ borderColor: cfg.ringColor + "40" }}
          />
        )}

        {/* Spinner ring (processing state) */}
        {cfg.spin && (
          <div
            className="orb-spin absolute inset-[-12px] rounded-full border-2 border-transparent"
            style={{ borderTopColor: cfg.ringColor, borderRightColor: cfg.ringColor + "40" }}
          />
        )}

        {/* Core orb */}
        <div
          className={cn(
            "relative rounded-full flex items-center justify-center transition-all duration-700",
            cfg.pulse && "orb-pulse",
            state !== "idle" && state !== "connecting" && "orb-glow",
          )}
          style={{
            width: 140,
            height: 140,
            background: `radial-gradient(circle at 38% 38%, ${cfg.orbColor}cc, ${cfg.orbColor}66 60%, ${cfg.orbColor}22)`,
            ["--orb-color" as string]: cfg.orbColor + "88",
            ["--orb-color-dim" as string]: cfg.orbColor + "33",
          }}
        >
          {/* Inner icon */}
          {state === "idle" || state === "connecting" ? (
            <Mic className="w-10 h-10 text-white/50" />
          ) : state === "listening" ? (
            <Mic className="w-10 h-10 text-white" />
          ) : state === "speaking" ? (
            <Volume2 className="w-10 h-10 text-white" />
          ) : (
            /* thinking / processing — animated dots */
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-white"
                  style={{ animation: `orb-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Conversation history ─────────────────────────────────────────────────────
function ConversationLog({
  history,
  liveTranscript,
  liveReply,
  state,
}: {
  history: ConversationTurn[];
  liveTranscript: string;
  liveReply: string;
  state: VoiceState;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, liveTranscript, liveReply]);

  const isEmpty = history.length === 0 && !liveTranscript && !liveReply;

  if (isEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/20 text-sm select-none">
        Your conversation will appear here
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 scrollbar-thin">
      {history.map((turn, i) => (
        <div key={i} className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
              turn.role === "user"
                ? "bg-white/10 text-white rounded-br-md"
                : "bg-white/[0.05] text-white/85 rounded-bl-md",
            )}
          >
            {turn.content}
          </div>
        </div>
      ))}

      {/* Live in-progress user transcript */}
      {(state === "processing" || state === "thinking") && liveTranscript && (
        <div className="flex justify-end">
          <div className="max-w-[82%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed bg-white/10 text-white">
            {liveTranscript}
          </div>
        </div>
      )}

      {/* Live AI reply streaming */}
      {(state === "thinking" || state === "speaking") && liveReply && (
        <div className="flex justify-start">
          <div className="max-w-[82%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed bg-white/[0.05] text-white/85">
            {liveReply}
            <span className="inline-block w-1 h-3.5 ml-0.5 bg-white/60 rounded-sm animate-pulse" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

// ── Compact selector ─────────────────────────────────────────────────────────
function CompactSelect({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[9px] font-mono uppercase tracking-widest text-white/30">{label}</p>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-full appearance-none bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 pr-8 text-xs text-white focus:outline-none focus:border-white/25 disabled:opacity-40 transition cursor-pointer"
        >
          {options.map(o => (
            <option key={o.id} value={o.id} className="bg-[#0a0a0a]">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface AudioChatModalProps {
  open: boolean;
  onClose: () => void;
}

export function AudioChatModal({ open, onClose }: AudioChatModalProps) {
  const [model, setModel] = useState("openai");
  const [voice, setVoice] = useState("nova");
  const [showSettings, setShowSettings] = useState(false);

  const {
    state,
    transcript,
    aiReply,
    callDuration,
    error,
    conversationHistory,
    beginCall,
    endCall,
    supported,
  } = usePollinationsVoice({ model, voice });

  const isActive = state !== "idle";
  const cfg = STATE_CONFIG[state];

  // Close + end call together
  const handleClose = () => {
    endCall();
    onClose();
  };

  const handleToggle = () => {
    if (isActive) {
      endCall();
    } else {
      beginCall();
    }
  };

  // Prevent scroll on body while modal open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={handleClose}
      />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-md rounded-3xl bg-[#0a0a0a] border border-white/10 shadow-2xl flex flex-col overflow-hidden"
           style={{ maxHeight: "90vh", minHeight: 560 }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Live Voice Chat</h2>
            <p className="text-[10px] text-white/30 font-mono mt-0.5">Powered by Pollinations.AI</p>
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="text-xs font-mono text-white/40 bg-white/[0.06] px-2.5 py-1 rounded-lg">
                {formatDuration(callDuration)}
              </span>
            )}
            <button
              onClick={() => setShowSettings(v => !v)}
              className="p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/[0.06] transition text-xs"
              title="Settings"
            >
              ⚙
            </button>
            <button
              onClick={handleClose}
              className="p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/[0.06] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="mx-4 mb-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] grid grid-cols-2 gap-3 shrink-0">
            <CompactSelect
              label="AI Model"
              value={model}
              onChange={setModel}
              options={MODELS}
              disabled={isActive}
            />
            <CompactSelect
              label="Voice"
              value={voice}
              onChange={setVoice}
              options={VOICES}
              disabled={isActive}
            />
            {isActive && (
              <p className="col-span-2 text-[10px] text-white/25 text-center">
                End the call to change model or voice
              </p>
            )}
          </div>
        )}

        {/* Orb + state */}
        <div className="flex flex-col items-center gap-4 py-5 shrink-0">
          <VoiceOrb state={state} />

          <div className="text-center">
            <p className="text-base font-medium text-white tracking-tight" style={{ color: cfg.orbColor === "#ffffff18" ? "rgba(255,255,255,0.6)" : cfg.orbColor }}>
              {cfg.label}
            </p>
            <p className="text-xs text-white/30 mt-0.5">{cfg.sublabel}</p>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 px-3 py-1.5 rounded-xl max-w-xs text-center">
              {error}
            </p>
          )}
        </div>

        {/* Conversation log */}
        <ConversationLog
          history={conversationHistory}
          liveTranscript={transcript}
          liveReply={aiReply}
          state={state}
        />

        {/* Controls */}
        <div className="shrink-0 px-5 pt-3 pb-6 flex flex-col items-center gap-3">
          {!supported ? (
            <p className="text-xs text-white/35 text-center">
              Microphone not supported in this browser
            </p>
          ) : (
            <button
              onClick={handleToggle}
              className={cn(
                "flex items-center gap-2.5 px-8 py-3.5 rounded-2xl font-medium text-sm transition-all duration-300",
                isActive
                  ? "bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25"
                  : "bg-white text-black hover:bg-white/90",
              )}
            >
              {isActive ? (
                <><PhoneOff className="w-4 h-4" /> End call</>
              ) : (
                <><Mic className="w-4 h-4" /> Start voice chat</>
              )}
            </button>
          )}

          {!showSettings && !isActive && (
            <p className="text-[10px] text-white/20 text-center">
              {MODELS.find(m => m.id === model)?.label} · {VOICES.find(v => v.id === voice)?.label} voice
              {" "}·{" "}
              <button onClick={() => setShowSettings(true)} className="underline underline-offset-2 hover:text-white/40 transition">
                change
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
