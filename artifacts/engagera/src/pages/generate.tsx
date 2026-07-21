import React, { useState, useRef, useCallback, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  usePollinationsText,
  usePollinationsImage,
  usePollinationsAudio,
  usePollinationsVideo,
  VOICE_OPTIONS,
  type Voice,
} from "@/hooks/usePollinations";
import { usePollinationsVoice, type VoiceState } from "@/hooks/usePollinationsVoice";
import {
  Wand2, Image as ImageIcon, Volume2, Video, Mic, MicOff,
  StopCircle, Send, Download, RefreshCw, Copy, Check, Phone, PhoneOff,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Shared helpers ────────────────────────────────────────────────────────────
const TEXT_MODELS = [
  { id: "openai",           label: "GPT-4o",              tag: "Pro"    },
  { id: "openai-large",     label: "GPT-4o Latest",        tag: "Pro"    },
  { id: "openai-reasoning", label: "o4-mini",              tag: "Reason" },
  { id: "claude",           label: "Claude 3.7 Sonnet",   tag: "Pro"    },
  { id: "claude-thinking",  label: "Claude + Thinking",   tag: "Reason" },
  { id: "gemini",           label: "Gemini 2.0 Flash",    tag: "Lite"   },
  { id: "gemini-thinking",  label: "Gemini Thinking",     tag: "Reason" },
  { id: "mistral",          label: "Mistral Large",        tag: "Pro"    },
  { id: "llama",            label: "Llama 3.3 70B",       tag: "Free"   },
  { id: "deepseek",         label: "DeepSeek-V3",         tag: "Pro"    },
  { id: "qwen-coder",       label: "Qwen 2.5 Coder",      tag: "Code"   },
];

const IMAGE_MODELS = [
  { id: "flux",         label: "Flux 1.1"       },
  { id: "flux-pro",     label: "Flux Pro"        },
  { id: "turbo",        label: "Turbo"           },
  { id: "flux-realism", label: "Flux Realism"    },
  { id: "flux-anime",   label: "Flux Anime"      },
  { id: "flux-3d",      label: "Flux 3D"         },
  { id: "gptimage",     label: "GPT Image"       },
];

const SIZES = [
  { label: "Square 1:1",   width: 1024, height: 1024 },
  { label: "Landscape 16:9", width: 1280, height: 720 },
  { label: "Portrait 9:16", width: 720,  height: 1280 },
  { label: "Wide 3:2",     width: 1200, height: 800  },
  { label: "Tall 2:3",     width: 800,  height: 1200 },
];

const TAG_COLORS: Record<string, string> = {
  Pro:    "bg-blue-500/10 text-blue-400",
  Lite:   "bg-green-500/10 text-green-400",
  Reason: "bg-purple-500/10 text-purple-400",
  Code:   "bg-amber-500/10 text-amber-400",
  Free:   "bg-white/5 text-white/40",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-2">
      {children}
    </p>
  );
}

function Select({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; tag?: string }>;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition"
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-[#111] text-white">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/[0.07] transition-colors">
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: "text",  label: "Text",  icon: Wand2     },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "audio", label: "Audio", icon: Volume2   },
  { id: "video", label: "Video", icon: Video     },
  { id: "voice", label: "Voice", icon: Mic       },
] as const;

type Tab = (typeof TABS)[number]["id"];

// ── Text tab ──────────────────────────────────────────────────────────────────
function TextTab() {
  const { generate, loading, error } = usePollinationsText();
  const [model,  setModel]  = useState("openai");
  const [system, setSystem] = useState("");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [showSys, setShowSys] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  const run = async () => {
    if (!prompt.trim() || loading) return;
    setOutput("");
    let cancelled = false;
    abortRef.current = () => { cancelled = true; };
    try {
      await generate(
        [{ role: "user", content: prompt }],
        {
          model,
          system: system.trim() || undefined,
          stream: true,
          onToken: (t) => { if (!cancelled) setOutput(prev => prev + t); },
        },
      );
    } catch (e) {
      if (!cancelled) setOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    abortRef.current = null;
  };

  const stop = () => { abortRef.current?.(); abortRef.current = null; };

  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Model</Label>
          <Select
            value={model}
            onChange={setModel}
            options={TEXT_MODELS.map(m => ({ value: m.id, label: m.label, tag: m.tag }))}
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setShowSys(v => !v)}
            className="text-xs text-white/40 hover:text-white/70 transition-colors underline underline-offset-2"
          >
            {showSys ? "Hide" : "Add"} system prompt
          </button>
        </div>
      </div>

      {showSys && (
        <div>
          <Label>System prompt</Label>
          <textarea
            value={system}
            onChange={e => setSystem(e.target.value)}
            rows={3}
            placeholder="You are a helpful assistant..."
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none transition"
          />
        </div>
      )}

      <div>
        <Label>Prompt</Label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={5}
          placeholder="What would you like to generate?"
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none transition"
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
        />
      </div>

      <div className="flex gap-3">
        {loading ? (
          <button onClick={stop} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-sm font-medium text-white hover:bg-white/15 transition">
            <StopCircle className="h-4 w-4" /> Stop
          </button>
        ) : (
          <button
            onClick={run}
            disabled={!prompt.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Send className="h-4 w-4" /> Generate
          </button>
        )}
        {output && (
          <>
            <CopyButton text={output} />
            <button onClick={() => { setOutput(""); setPrompt(""); }} className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/[0.07] transition-colors">
              <RefreshCw className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {(output || loading) && (
        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
          <Label>Output</Label>
          {loading && !output && (
            <div className="flex gap-1 mt-2">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          )}
          <p className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed">{output}</p>
        </div>
      )}
    </div>
  );
}

// ── Image tab ─────────────────────────────────────────────────────────────────
function ImageTab() {
  const { generate, loading, error } = usePollinationsImage();
  const [model,  setModel]  = useState("flux");
  const [size,   setSize]   = useState(0);
  const [prompt, setPrompt] = useState("");
  const [enhance, setEnhance] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  const run = async () => {
    if (!prompt.trim() || loading) return;
    setImageUrl(null);
    setImgLoaded(false);
    try {
      const s   = SIZES[size];
      const res = await generate({ prompt, model, width: s.width, height: s.height, enhance });
      setImageUrl(res.url);
    } catch { /* error shown below */ }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label>Model</Label>
          <Select value={model} onChange={setModel} options={IMAGE_MODELS.map(m => ({ value: m.id, label: m.label }))} />
        </div>
        <div>
          <Label>Size</Label>
          <Select
            value={String(size)}
            onChange={v => setSize(Number(v))}
            options={SIZES.map((s, i) => ({ value: String(i), label: s.label }))}
          />
        </div>
        <div className="flex items-end pb-0.5">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setEnhance(v => !v)}
              className={cn(
                "w-10 h-5 rounded-full transition-colors relative",
                enhance ? "bg-white/70" : "bg-white/10",
              )}
            >
              <span className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black transition-transform",
                enhance ? "translate-x-5" : "translate-x-0",
              )} />
            </div>
            <span className="text-sm text-white/60">Enhance</span>
          </label>
        </div>
      </div>

      <div>
        <Label>Prompt</Label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={4}
          placeholder="A hyperrealistic photo of a fox in a neon-lit Tokyo alley, 8k..."
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none transition"
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
        />
      </div>

      <button
        onClick={run}
        disabled={!prompt.trim() || loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {loading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</> : <><ImageIcon className="h-4 w-4" /> Generate</>}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {imageUrl && (
        <div className="rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.07]">
          {!imgLoaded && (
            <div className="h-64 flex items-center justify-center">
              <RefreshCw className="h-6 w-6 text-white/20 animate-spin" />
            </div>
          )}
          <img
            src={imageUrl}
            alt={prompt}
            className={cn("w-full object-contain max-h-[600px]", imgLoaded ? "block" : "hidden")}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
          />
          {imgLoaded && (
            <div className="flex gap-2 p-3 border-t border-white/[0.07]">
              <a
                href={imageUrl}
                download="engagera-image.jpg"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.07] text-xs text-white/60 hover:text-white hover:bg-white/10 transition"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Audio tab ─────────────────────────────────────────────────────────────────
function AudioTab() {
  const { synthesize, loading, error } = usePollinationsAudio();
  const [voice,    setVoice]    = useState<Voice>("nova");
  const [text,     setText]     = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const run = async () => {
    if (!text.trim() || loading) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    try {
      const url = await synthesize(text, voice);
      setAudioUrl(url);
    } catch { /* shown below */ }
  };

  useEffect(() => {
    if (audioUrl && audioRef.current) audioRef.current.load();
  }, [audioUrl]);

  return (
    <div className="space-y-5">
      <div>
        <Label>Voice</Label>
        <div className="flex flex-wrap gap-2">
          {VOICE_OPTIONS.map(v => (
            <button
              key={v}
              onClick={() => setVoice(v)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium capitalize transition",
                voice === v
                  ? "bg-white text-black"
                  : "bg-white/[0.05] text-white/60 hover:bg-white/[0.09] hover:text-white",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Text to speak</Label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={6}
          placeholder="Type or paste any text to convert to natural-sounding speech…"
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none transition"
        />
        <p className="text-[11px] text-white/25 mt-1.5 text-right">{text.length} chars</p>
      </div>

      <button
        onClick={run}
        disabled={!text.trim() || loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {loading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</> : <><Volume2 className="h-4 w-4" /> Synthesize</>}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {audioUrl && (
        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5">
          <Label>Playback</Label>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} controls className="w-full mt-2" src={audioUrl} />
          <a
            href={audioUrl}
            download="engagera-audio.mp3"
            className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-white/[0.07] text-xs text-white/60 hover:text-white hover:bg-white/10 transition"
          >
            <Download className="h-3.5 w-3.5" /> Download MP3
          </a>
        </div>
      )}
    </div>
  );
}

// ── Video tab ─────────────────────────────────────────────────────────────────
function VideoTab() {
  const { generate, loading, error } = usePollinationsVideo();
  const [prompt,   setPrompt]   = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const run = async () => {
    if (!prompt.trim() || loading) return;
    setVideoUrl(null);
    try {
      const res = await generate(prompt);
      if (res.url) setVideoUrl(res.url);
    } catch { /* shown below */ }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 px-5 py-4">
        <p className="text-xs text-amber-400/80 leading-relaxed">
          <span className="font-semibold text-amber-400">Note:</span> Video generation is Pollinations' newest capability.
          Results may vary — if unavailable, the URL will be null. Expect up to 30–60 s for generation.
        </p>
      </div>

      <div>
        <Label>Prompt</Label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={4}
          placeholder="A cinematic drone shot over misty mountains at sunrise, 4K, Pixar style…"
          className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none transition"
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
        />
      </div>

      <button
        onClick={run}
        disabled={!prompt.trim() || loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {loading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</> : <><Video className="h-4 w-4" /> Generate Video</>}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {videoUrl && (
        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] overflow-hidden">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video controls className="w-full max-h-[500px]" src={videoUrl} />
          <div className="p-3 border-t border-white/[0.07] flex gap-2">
            <a
              href={videoUrl}
              download="engagera-video.mp4"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.07] text-xs text-white/60 hover:text-white hover:bg-white/10 transition"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Voice tab ─────────────────────────────────────────────────────────────────
const STATE_LABELS: Record<VoiceState, string> = {
  idle:       "Ready to talk",
  connecting: "Connecting…",
  listening:  "Listening…",
  processing: "Transcribing…",
  thinking:   "Thinking…",
  speaking:   "Speaking…",
};

const STATE_COLORS: Record<VoiceState, string> = {
  idle:       "text-white/30",
  connecting: "text-amber-400",
  listening:  "text-green-400",
  processing: "text-blue-400",
  thinking:   "text-purple-400",
  speaking:   "text-cyan-400",
};

function VoiceTab() {
  const [voiceModel, setVoiceModel] = useState("openai");
  const [ttsVoice,   setTtsVoice]  = useState<Voice>("nova");
  const { state, transcript, aiReply, callDuration, error, beginCall, endCall, supported } =
    usePollinationsVoice({ model: voiceModel, voice: ttsVoice });

  const active = state !== "idle";

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (!supported) {
    return (
      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-10 text-center">
        <MicOff className="h-10 w-10 text-white/20 mx-auto mb-3" />
        <p className="text-white/50 text-sm">Microphone access is not available in this browser.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!active && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>AI Model</Label>
            <Select value={voiceModel} onChange={setVoiceModel} options={TEXT_MODELS.map(m => ({ value: m.id, label: m.label }))} />
          </div>
          <div>
            <Label>Voice</Label>
            <Select
              value={ttsVoice}
              onChange={v => setTtsVoice(v as Voice)}
              options={VOICE_OPTIONS.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))}
            />
          </div>
        </div>
      )}

      {/* Call button */}
      <div className="flex flex-col items-center gap-6 py-8">
        <button
          onClick={active ? endCall : beginCall}
          className={cn(
            "w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-2xl",
            active
              ? "bg-red-500 hover:bg-red-600 shadow-red-500/30"
              : "bg-white hover:bg-white/90 shadow-white/10",
          )}
        >
          {active
            ? <PhoneOff className="h-9 w-9 text-white" />
            : <Phone     className="h-9 w-9 text-black" />}
        </button>

        <div className="text-center">
          <p className={cn("text-sm font-medium transition-colors", STATE_COLORS[state])}>
            {STATE_LABELS[state]}
          </p>
          {active && (
            <p className="text-xs text-white/25 mt-1 font-mono">{fmt(callDuration)}</p>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}

      {/* Live transcript + reply */}
      {active && (transcript || aiReply) && (
        <div className="space-y-3">
          {transcript && (
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] px-5 py-4">
              <Label>You said</Label>
              <p className="text-sm text-white/80">{transcript}</p>
            </div>
          )}
          {aiReply && (
            <div className="rounded-2xl bg-white/[0.06] border border-white/[0.07] px-5 py-4">
              <Label>AI reply</Label>
              <p className="text-sm text-white/85 whitespace-pre-wrap">{aiReply}</p>
            </div>
          )}
        </div>
      )}

      {!active && (
        <p className="text-xs text-white/25 text-center">
          Powered by Pollinations.AI · Speech-to-text · {TEXT_MODELS.find(m => m.id === voiceModel)?.label} · Neural TTS
        </p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Generate() {
  const [tab, setTab] = useState<Tab>("text");

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-light tracking-tight">Generate Studio</h1>
          <p className="text-sm text-white/40 mt-1.5">
            Powered by Pollinations.AI — text, image, audio, video &amp; real-time voice.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white/[0.04] rounded-2xl p-1.5 w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                tab === id
                  ? "bg-white text-black shadow"
                  : "text-white/50 hover:text-white hover:bg-white/[0.06]",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="rounded-3xl bg-white/[0.03] border border-white/[0.07] p-6 md:p-8">
          {tab === "text"  && <TextTab  />}
          {tab === "image" && <ImageTab />}
          {tab === "audio" && <AudioTab />}
          {tab === "video" && <VideoTab />}
          {tab === "voice" && <VoiceTab />}
        </div>

        <p className="text-[11px] text-white/20 text-center">
          Engagera Generate Studio · Pollinations.AI integration · All generations are private
        </p>
      </div>
    </AppLayout>
  );
}
