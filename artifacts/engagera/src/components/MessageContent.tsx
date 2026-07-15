import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy, Check, ImageOff, Film,
  ThumbsUp, ThumbsDown, Volume2, VolumeX,
  Share2, Globe, FileDown, ChevronLeft, ChevronRight, X,
  Download,
} from "lucide-react";
import type { TimeInfo, WeatherInfo } from "@/hooks/useEdgeChatCompletion";

export interface Source {
  title: string;
  url: string;
  snippet?: string;
  image?: string;  // og:image / twitter:image from the crawled page
}

interface MessageContentProps {
  content: string;
  sources?: Source[];
  timeInfo?: TimeInfo;
  weatherInfo?: WeatherInfo;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getFavicon(url: string, sz = 16) {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=${sz}`;
  } catch { return null; }
}
function getDomain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
function cleanForSpeech(md: string) {
  return md
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[-*+]\s+/g, "")
    .replace(/\n+/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

// Defense-in-depth: the model is instructed never to print raw link lines,
// but older stored messages (or an occasional slip) may still contain them.
// Strip "URL:"/"Link:"/"Source:" lines and standalone bare-URL lines before
// rendering — the app already shows real clickable source cards separately,
// so a message never needs to expose a raw link as plain text.
function sanitizeLinkNoise(md: string): string {
  return md
    // "1. URL: https://..." / "   URL: https://..." / "- Link: https://..."
    .replace(/^[ \t]*[-*•]?\s*(URL|Link|Source)\s*:\s*https?:\/\/\S+[ \t]*$/gim, "")
    // A line that is nothing but a bare URL (not part of a markdown link)
    .replace(/^[ \t]*https?:\/\/\S+[ \t]*$/gm, "")
    // Collapse the blank-line gaps left behind
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract display name from a source (e.g. "Wikipedia" from "en.wikipedia.org") */
function extractSiteName(source: Source): string {
  if (source.title) {
    for (const sep of [" - ", " | ", " – ", " — "]) {
      if (source.title.includes(sep)) {
        const last = source.title.split(sep).pop()?.trim() ?? "";
        if (last.length > 1 && last.length < 40) return last;
      }
    }
  }
  try {
    const hostname = new URL(source.url).hostname.replace(/^www\./, "");
    const parts = hostname.split(".");
    const name = parts.length >= 2 ? parts[parts.length - 2] : hostname;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch { return source.url.slice(0, 20); }
}

/** Recursively pull all text content from React children nodes */
function childrenToText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (!children) return "";
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  if (typeof children === "object" && "props" in (children as object)) {
    return childrenToText((children as any).props?.children ?? "");
  }
  return "";
}

// ── Favicon image with fallback ───────────────────────────────────────────────
function Favicon({ url, size = 16 }: { url: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(() => getFavicon(url, size));
  const [failed, setFailed] = useState(false);
  if (failed || !src) return <Globe className="text-white/20" style={{ width: size, height: size }} />;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="object-contain rounded-full"
      onError={() => { if (!failed) { setSrc(getFavicon(url, 32)); setFailed(true); } }}
    />
  );
}

// ── Source pill: favicon + bold site name, fully clickable, no raw URL shown ───
function SourcePill({ source }: { source: Source }) {
  const name = extractSiteName(source);
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.09] hover:border-white/20 transition-all group no-underline"
      title={name}
    >
      <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center overflow-hidden rounded-full">
        <Favicon url={source.url} size={14} />
      </span>
      <span className="text-[11px] font-semibold text-white/55 group-hover:text-white/85 transition-colors truncate max-w-[120px]">
        {name}
      </span>
    </a>
  );
}

// ── Source strip (shown below message content when search ran) ────────────────
function InlineFaviconCluster({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sources.slice(0, 6).map((s, i) => (
        <SourcePill key={i} source={s} />
      ))}
    </div>
  );
}

// ── Sources bottom sheet (opened from the action bar) ───────────────────────────
// Full list of sources for a message. Each row is a favicon + bold site name +
// a one-line snippet, and clicking it opens the exact crawled article URL —
// never a bare/raw link rendered as text.
function SourcesSheet({ sources, onClose }: { sources: Source[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="sources-sheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        key="sources-sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 32, stiffness: 340 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => { if (info.offset.y > 90) onClose(); }}
        className="fixed bottom-0 left-0 right-0 z-[101] mx-auto w-full max-w-lg bg-[#111214] border-t border-white/10 rounded-t-3xl shadow-2xl max-h-[75vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Sources"
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0 cursor-grab active:cursor-grabbing">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-5 pb-3 pt-1 shrink-0 border-b border-white/[0.06]">
          <div>
            <p className="text-sm font-semibold text-white/90">Sources</p>
            <p className="text-[11px] text-white/35">{sources.length} page{sources.length === 1 ? "" : "s"} read by AfuBot</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-2.5 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {sources.map((s, i) => {
            const name = extractSiteName(s);
            return (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex items-center gap-3 px-2.5 py-2.5 rounded-2xl hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors group"
              >
                {/* Real og:image when available, else favicon */}
                <span className="w-10 h-10 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center overflow-hidden shrink-0">
                  {s.image ? (
                    <img
                      src={s.image}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextSibling as HTMLElement | null)?.removeAttribute("style"); }}
                    />
                  ) : (
                    <Favicon url={s.url} size={20} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-white/85 group-hover:text-white truncate transition-colors">
                    {name}
                  </span>
                  {s.snippet && (
                    <span className="block text-[11px] text-white/35 truncate">{s.snippet}</span>
                  )}
                </span>
                <ChevronRight className="w-4 h-4 text-white/20 shrink-0 group-hover:text-white/40 transition-colors" />
              </a>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

// ── Message action bar ────────────────────────────────────────────────────────
function MessageActions({ content, sources }: { content: string; sources?: Source[] }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleListen = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(cleanForSpeech(content));
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const handleShare = async () => {
    const text = cleanForSpeech(content).slice(0, 300);
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(content);
    }
  };

  const iconBtn = (active = false) =>
    `p-1.5 rounded-lg transition-colors ${active
      ? "text-white bg-white/10"
      : "text-white/25 hover:text-white/70 hover:bg-white/[0.06]"}`;

  return (
    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/[0.05]">
      {/* Left actions */}
      <div className="flex items-center gap-0.5">
        <button onClick={handleCopy} className={iconBtn(copied)} title="Copy">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => setFeedback(f => f === "up" ? null : "up")}
          className={iconBtn(feedback === "up")}
          title="Accurate"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setFeedback(f => f === "down" ? null : "down")}
          className={iconBtn(feedback === "down")}
          title="Not accurate"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleListen} className={iconBtn(speaking)} title={speaking ? "Stop" : "Listen"}>
          {speaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
        <button onClick={handleShare} className={iconBtn()} title="Share">
          <Share2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right — sources favicon cluster */}
      {sources && sources.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setSourcesOpen(v => !v)}
            className="flex items-center gap-1.5 text-white/30 hover:text-white/60 transition-colors"
          >
            <span className="flex items-center">
              {sources.slice(0, 3).map((s, i) => (
                <span
                  key={i}
                  className="w-[18px] h-[18px] rounded-full border-2 border-black bg-white/10 flex items-center justify-center overflow-hidden"
                  style={{ marginLeft: i > 0 ? -5 : 0, zIndex: 3 - i }}
                >
                  <Favicon url={s.url} size={11} />
                </span>
              ))}
            </span>
            <span className="text-[11px] font-medium ml-0.5">Sources</span>
          </button>
          {sourcesOpen && (
            <SourcesSheet sources={sources} onClose={() => setSourcesOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Real-time clock widget ────────────────────────────────────────────────────
function ClockWidget({ timeInfo }: { timeInfo: TimeInfo }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...opts, timeZone: timeInfo.ianaZone }).format(now);

  const hours24 = (() => {
    const h = parseInt(fmt({ hour: "numeric", hour12: false }), 10);
    return isNaN(h) ? 0 : h % 24;
  })();
  const minutes = parseInt(fmt({ minute: "2-digit" }), 10) || 0;
  const seconds = parseInt(fmt({ second: "2-digit" }), 10) || 0;

  const digital = `${String(hours24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const dateLabel = fmt({ weekday: "short", month: "short", day: "numeric" });

  // UTC offset label
  const utcOffsetMin = (() => {
    try {
      const localStr = now.toLocaleString("en-US", { timeZone: timeInfo.ianaZone });
      const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
      const diff = (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000;
      return Math.round(diff);
    } catch { return 0; }
  })();
  const sign = utcOffsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(utcOffsetMin);
  const utcLabel = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? ":" + String(abs % 60).padStart(2, "0") : ""}`;

  // Clock hand angles (degrees, 0 = 12 o'clock)
  const secDeg = seconds * 6;
  const minDeg = minutes * 6 + seconds * 0.1;
  const hrDeg = (hours24 % 12) * 30 + minutes * 0.5;

  const hand = (deg: number, len: number, color: string, width: number) => {
    const rad = (deg - 90) * (Math.PI / 180);
    return (
      <line
        x1="32" y1="32"
        x2={32 + len * Math.cos(rad)}
        y2={32 + len * Math.sin(rad)}
        stroke={color} strokeWidth={width} strokeLinecap="round"
      />
    );
  };

  return (
    <div className="my-4 flex items-center gap-4 p-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] max-w-[290px]">
      {/* Digital + location */}
      <div className="flex-1 min-w-0">
        <div className="text-3xl font-bold tracking-tight tabular-nums leading-none">{digital}</div>
        <div className="text-[13px] text-white/55 mt-1.5 truncate">{timeInfo.label}</div>
        <div className="text-[11px] text-white/30 mt-0.5">{dateLabel} · {utcLabel}</div>
      </div>

      {/* Analog clock */}
      <div className="shrink-0">
        <svg width="64" height="64" viewBox="0 0 64 64">
          {/* Face */}
          <circle cx="32" cy="32" r="31" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          {/* Hour markers */}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * 30 - 90) * (Math.PI / 180);
            const isQuarter = i % 3 === 0;
            const r1 = isQuarter ? 24 : 26;
            return (
              <line key={i}
                x1={32 + r1 * Math.cos(a)} y1={32 + r1 * Math.sin(a)}
                x2={32 + 30 * Math.cos(a)} y2={32 + 30 * Math.sin(a)}
                stroke={isQuarter ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"}
                strokeWidth={isQuarter ? 1.5 : 1}
              />
            );
          })}
          {/* Hands */}
          {hand(hrDeg, 16, "white", 2.5)}
          {hand(minDeg, 23, "rgba(255,255,255,0.85)", 1.5)}
          {hand(secDeg, 27, "#ef4444", 1)}
          {/* Center cap */}
          <circle cx="32" cy="32" r="2.5" fill="white" />
          <circle cx="32" cy="32" r="1.2" fill="#ef4444" />
        </svg>
      </div>
    </div>
  );
}

// ── Real-time weather widget ───────────────────────────────────────────────────
function WeatherIcon({ icon, isDay }: { icon: string; isDay: boolean }) {
  const stroke = "white";
  const common = { width: 40, height: 40, viewBox: "0 0 40 40", fill: "none" } as const;
  switch (icon) {
    case "sun":
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="8" fill={isDay ? "#fbbf24" : "rgba(255,255,255,0.5)"} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * 45) * (Math.PI / 180);
            return <line key={i} x1={20 + 12 * Math.cos(a)} y1={20 + 12 * Math.sin(a)} x2={20 + 16 * Math.cos(a)} y2={20 + 16 * Math.sin(a)} stroke={isDay ? "#fbbf24" : "rgba(255,255,255,0.4)"} strokeWidth="1.5" strokeLinecap="round" />;
          })}
        </svg>
      );
    case "cloud-sun":
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="6" fill="#fbbf24" />
          <path d="M11 26a6 6 0 0 1 1-11.9A8 8 0 0 1 27 17.5 5.5 5.5 0 0 1 26 26H11z" fill="rgba(255,255,255,0.7)" />
        </svg>
      );
    case "fog":
      return (
        <svg {...common}>
          <path d="M11 18a6 6 0 0 1 1-11.9A8 8 0 0 1 27 9.5 5.5 5.5 0 0 1 26 18H11z" fill="rgba(255,255,255,0.5)" />
          <line x1="10" y1="24" x2="30" y2="24" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
          <line x1="8" y1="29" x2="32" y2="29" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "drizzle":
    case "rain":
      return (
        <svg {...common}>
          <path d="M11 18a6 6 0 0 1 1-11.9A8 8 0 0 1 27 9.5 5.5 5.5 0 0 1 26 18H11z" fill="rgba(255,255,255,0.7)" />
          {[13, 20, 27].map((x, i) => (
            <line key={i} x1={x} y1="23" x2={x - 2} y2="30" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
          ))}
        </svg>
      );
    case "snow":
      return (
        <svg {...common}>
          <path d="M11 18a6 6 0 0 1 1-11.9A8 8 0 0 1 27 9.5 5.5 5.5 0 0 1 26 18H11z" fill="rgba(255,255,255,0.7)" />
          {[13, 20, 27].map((x, i) => (
            <circle key={i} cx={x} cy="27" r="1.6" fill="white" />
          ))}
        </svg>
      );
    case "storm":
      return (
        <svg {...common}>
          <path d="M11 16a6 6 0 0 1 1-11.9A8 8 0 0 1 27 7.5 5.5 5.5 0 0 1 26 16H11z" fill="rgba(255,255,255,0.6)" />
          <path d="M21 18l-5 8h4l-3 7 8-10h-4l3-5z" fill="#fbbf24" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M11 20a6 6 0 0 1 1-11.9A8 8 0 0 1 27 11.5 5.5 5.5 0 0 1 26 20H11z" fill="rgba(255,255,255,0.6)" stroke={stroke} strokeWidth="0" />
        </svg>
      );
  }
}

function WeatherWidget({ weatherInfo }: { weatherInfo: WeatherInfo }) {
  return (
    <div className="my-4 flex items-center gap-4 p-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] max-w-[290px]">
      <div className="flex-1 min-w-0">
        <div className="text-3xl font-bold tracking-tight tabular-nums leading-none">{weatherInfo.tempC}°C</div>
        <div className="text-[13px] text-white/55 mt-1.5 truncate">{weatherInfo.label}</div>
        <div className="text-[11px] text-white/30 mt-0.5">
          {weatherInfo.condition} · Feels {weatherInfo.feelsLikeC}°C
        </div>
        <div className="text-[11px] text-white/30 mt-0.5">
          Humidity {weatherInfo.humidity}% · Wind {weatherInfo.windKph} km/h
        </div>
      </div>
      <div className="shrink-0">
        <WeatherIcon icon={weatherInfo.icon} isDay={weatherInfo.isDay} />
      </div>
    </div>
  );
}

// ── SVG renderer ──────────────────────────────────────────────────────────────
// SVG markup is never injected into the live DOM (that would let it run
// scripts/animations or reach out to external refs). Instead it is rendered
// through a plain <img> pointed at a data: URI — the browser treats that as
// a static raster-like image, never as executable markup — so the "SVG
// format" itself is never exposed/interactive in the chat, only a picture of
// it. Users can still download the original .svg file via the button below.
function svgToDataUri(code: string): string {
  const safe = code
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "");
  const base64 = btoa(unescape(encodeURIComponent(safe)));
  return `data:image/svg+xml;base64,${base64}`;
}

function SvgBlock({ code }: { code: string }) {
  const [expanded, setExpanded] = useState(false);
  const dataUri = svgToDataUri(code);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([code], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `image-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-3">
      <div className={`relative rounded-xl overflow-hidden border border-white/10 bg-[#111] cursor-pointer ${expanded ? "max-w-full" : "max-w-sm"}`} onClick={() => setExpanded(v => !v)}>
        <img src={dataUri} alt="Generated image" className="w-full h-auto" style={{ maxWidth: expanded ? "100%" : "400px" }} />
        <button
          onClick={handleDownload}
          title="Download SVG"
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white/70 hover:text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-white/25 mt-1.5">Click to {expanded ? "shrink" : "expand"}</p>
    </div>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative my-3 overflow-hidden rounded-xl">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e] border border-white/10 rounded-t-xl">
        <span className="text-[10px] text-white/35 font-mono uppercase tracking-wider">{language || "code"}</span>
        <button onClick={() => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })} className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/70 transition-colors rounded-lg px-1.5 py-0.5">
          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
      </div>
      <SyntaxHighlighter language={language || "text"} style={oneDark} PreTag="div"
        customStyle={{ margin: 0, borderRadius: "0 0 0.75rem 0.75rem", border: "1px solid rgba(255,255,255,0.1)", borderTop: "none", fontSize: "0.8rem", lineHeight: "1.6", background: "#1a1a1a" }}
        codeTagProps={{ style: { fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace" } }}>
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ── Image block ───────────────────────────────────────────────────────────────
const IMAGE_LOAD_MAX_RETRIES = 3;

function ImageBlock({ src, alt }: { src: string; alt?: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let blobUrl: string;
      let revoke = false;
      if (/^data:/i.test(src)) {
        blobUrl = src;
      } else {
        const res = await fetch(src);
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
        revoke = true;
      }
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `image-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (revoke) URL.revokeObjectURL(blobUrl);
    } catch {
      // best-effort download; ignore failures silently (image stays viewable)
    }
  };

  // data: URIs are embedded bytes with no network round-trip — never worth
  // retrying and never expected to fail. Only http(s) URLs (e.g. a poster
  // the backend couldn't inline) get transient-failure retries.
  const isDataUri = /^data:/i.test(src);

  useEffect(() => {
    setStatus("loading");
    setAttempt(0);
  }, [src]);

  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  const handleError = () => {
    if (!isDataUri && attempt < IMAGE_LOAD_MAX_RETRIES) {
      retryTimer.current = setTimeout(() => {
        setAttempt((a) => a + 1);
        setStatus("loading");
      }, 500 * (attempt + 1));
    } else {
      setStatus("error");
    }
  };

  // Cache-bust each retry so the browser doesn't just replay the same
  // failed network response from a warm cache entry.
  const attemptSrc = isDataUri || attempt === 0 ? src : `${src}${src.includes("?") ? "&" : "?"}_retry=${attempt}`;

  return (
    <div className="my-3">
      {status === "loading" && (
        <div className="w-64 h-48 rounded-xl border border-white/10 bg-[#111] flex flex-col items-center justify-center gap-3">
          <div className="flex gap-1.5">{[0, 150, 300].map(d => <span key={d} className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div>
          <span className="text-xs text-white/35">{attempt > 0 ? "Retrying…" : "Loading…"}</span>
        </div>
      )}
      {status === "error" && (
        <div className="w-64 h-48 rounded-xl border border-white/10 bg-[#111] flex flex-col items-center justify-center gap-2">
          <ImageOff className="h-5 w-5 text-white/20" /><p className="text-xs text-white/35">Image unavailable</p>
        </div>
      )}
      {(status === "loading" || status === "loaded") && (
        <div className={`relative ${expanded ? "max-w-full w-full" : "max-w-sm"}`}>
          <img key={attempt} src={attemptSrc} alt={alt || "Image"} onLoad={() => setStatus("loaded")} onError={handleError}
            style={{ display: status === "loaded" ? undefined : "none" }}
            className="rounded-xl object-cover cursor-pointer w-full"
            onClick={() => setExpanded(v => !v)} />
          {status === "loaded" && (
            <button
              onClick={handleDownload}
              title="Download image"
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white/70 hover:text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Media card horizontal scroll ──────────────────────────────────────────────
interface MediaCard { title: string; year?: string; thumbnail?: string | null; fetching: boolean; }

// ── Module-level thumbnail cache (persists across renders/re-mounts) ──────────
// Key: lowercase title. Value: resolved thumbnail URL or null (not found).
const thumbCache = new Map<string, { thumb: string | null; year?: string }>();
// In-flight promises so concurrent renders don't trigger duplicate requests.
const thumbInFlight = new Map<string, Promise<{ thumb: string | null; year?: string }>>();

type WikiSummary = { thumbnail?: { source: string }; description?: string };

function fetchWikiThumb(title: string): Promise<{ thumb: string | null; year?: string }> {
  const key = title.toLowerCase();
  if (thumbCache.has(key)) return Promise.resolve(thumbCache.get(key)!);
  if (thumbInFlight.has(key)) return thumbInFlight.get(key)!;

  const slug = encodeURIComponent(title.replace(/\s+/g, "_"));
  const get = (suffix: string) =>
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}${suffix}`, {
      signal: AbortSignal.timeout(5000),
    }).then<WikiSummary>(r => (r.ok ? r.json() : Promise.reject()));

  // Race all three variants simultaneously — resolve as soon as any succeeds.
  const p = Promise.any([get("_film"), get(""), get("_TV_series")])
    .then(data => ({ thumb: data.thumbnail?.source ?? null, year: data.description?.match(/\d{4}/)?.[0] }))
    .catch(() => ({ thumb: null }))
    .then(result => {
      thumbCache.set(key, result);
      thumbInFlight.delete(key);
      return result;
    });

  thumbInFlight.set(key, p);
  return p;
}

const MEDIA_SKIP = /^(Step|Part|Section|Chapter|Option|Note|Example|Important|Warning|Tip|Reason|First|Second|Third|Then|Next|Finally|Also|However|The following|Note that|Keep in mind|Remember|Consider|Additionally|Furthermore|Moreover)\s/i;

function detectMediaTitles(content: string): string[] {
  const lines = content.split("\n");
  const titles: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const t = line.trim();
    let title = "";

    // Pattern 1: "1. Title" or "1. **Title**" (numbered list)
    const m1 = t.match(/^\*{0,2}\d+[.)]\s+\*{0,2}([A-Z*][^(\n:—–]{2,55}?)\*{0,2}(?:\s*\(\d{4}\))?(?:\s*[-–—:]|$)/);
    if (m1) title = m1[1];

    // Pattern 2: "**Title (2006)**" or "**Title**" on its own line
    if (!title) {
      const m2 = t.match(/^\*{1,2}([A-Z][^*\n]{2,55}?)\*{1,2}\s*(?:\(\d{4}\))?(?:\s*[-–—:]|$)/);
      if (m2) title = m2[1];
    }

    // Pattern 3: "- Title" or "• Title" bullet
    if (!title) {
      const m3 = t.match(/^[-•]\s+([A-Z][^-•\n:]{2,55}?)\s*(?:\(\d{4}\))?(?:\s*[-–—:]|$)/);
      if (m3) title = m3[1];
    }

    // Pattern 4: line that starts with a capital word, ends with (year) — e.g. "Inception (2010)"
    if (!title) {
      const m4 = t.match(/^([A-Z][A-Za-z0-9 ',!.&:-]{2,55})\s+\(\d{4}\)\s*(?:[-–—:]|$)/);
      if (m4) title = m4[1];
    }

    title = title.trim().replace(/\*+/g, "").replace(/\s+/g, " ");

    if (
      title.length > 2 &&
      title.length < 60 &&
      /^[A-Z]/.test(title) &&
      !MEDIA_SKIP.test(title) &&
      !seen.has(title.toLowerCase())
    ) {
      // Kick off the Wikipedia fetch immediately — before the card row even renders.
      fetchWikiThumb(title);
      titles.push(title);
      seen.add(title.toLowerCase());
    }
  }

  return titles.length >= 2 ? titles.slice(0, 8) : [];
}

function MediaCardsRow({ titles }: { titles: string[] }) {
  const [cards, setCards] = useState<MediaCard[]>(() =>
    titles.map(t => {
      const cached = thumbCache.get(t.toLowerCase());
      return cached
        ? { title: t, fetching: false, thumbnail: cached.thumb, year: cached.year }
        : { title: t, fetching: true, thumbnail: null };
    })
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const syncArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    syncArrows();
    const el = scrollRef.current;
    el?.addEventListener("scroll", syncArrows, { passive: true });
    return () => el?.removeEventListener("scroll", syncArrows);
  }, [cards.length]);

  const pan = (dir: "l" | "r") =>
    scrollRef.current?.scrollBy({ left: dir === "r" ? 300 : -300, behavior: "smooth" });

  const titlesKey = titles.join("||");
  useEffect(() => {
    setCards(prev => {
      const seen = new Set(prev.map(c => c.title.toLowerCase()));
      const next = [...prev];
      for (const t of titles) {
        if (seen.has(t.toLowerCase())) continue;
        const cached = thumbCache.get(t.toLowerCase());
        next.push(cached
          ? { title: t, fetching: false, thumbnail: cached.thumb, year: cached.year }
          : { title: t, fetching: true, thumbnail: null });
      }
      return next;
    });
    titles.forEach(title => {
      if (thumbCache.has(title.toLowerCase())) return;
      fetchWikiThumb(title).then(result => {
        setCards(prev =>
          prev.map(c =>
            c.title.toLowerCase() === title.toLowerCase()
              ? { ...c, fetching: false, thumbnail: result.thumb, year: result.year }
              : c
          )
        );
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titlesKey]);

  return (
    <div className="relative my-5 group/carousel">
      {/* Left arrow */}
      <button
        onClick={() => pan("l")}
        className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/80 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black transition-all duration-150 ${canLeft ? "opacity-0 group-hover/carousel:opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto select-none"
        style={{ scrollbarWidth: "none", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {cards.map((card, i) => (
          <div
            key={card.title + i}
            className="shrink-0 relative rounded-xl overflow-hidden bg-white/[0.04] cursor-default"
            style={{ width: 115, height: 168, scrollSnapAlign: "start", flexShrink: 0 }}
          >
            {/* Image / loading / fallback */}
            {card.fetching ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/[0.04]">
                <div className="w-5 h-5 border border-white/15 border-t-white/55 rounded-full animate-spin" />
              </div>
            ) : card.thumbnail ? (
              <img
                src={card.thumbnail}
                alt={card.title}
                className="absolute inset-0 w-full h-full object-cover"
                onError={() =>
                  setCards(prev =>
                    prev.map((c, j) => j === i ? { ...c, thumbnail: null } : c)
                  )
                }
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: "linear-gradient(145deg,#1c1c2e 0%,#16213e 60%,#0f3460 100%)" }}
              >
                <Film className="w-7 h-7 text-white/15" />
              </div>
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent pointer-events-none" />

            {/* Title + year */}
            <div className="absolute bottom-0 left-0 right-0 px-2 pb-2 pt-6">
              <p className="text-[10px] font-semibold leading-snug text-white line-clamp-2">{card.title}</p>
              {card.year && <p className="text-[9px] text-white/45 mt-0.5">{card.year}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Right arrow */}
      <button
        onClick={() => pan("r")}
        className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/80 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black transition-all duration-150 ${canRight ? "opacity-0 group-hover/carousel:opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
// A markdown image (![alt](url)) means a tool already embedded real,
// verified media (e.g. TMDB posters) directly in the message. In that case
// skip the heuristic title-guessing card row below — it fetches thumbnails
// from Wikipedia by regex-matched title, which has no relation to the actual
// movie/show and has been observed to show the wrong poster and a wrong
// "year" (e.g. a person's birth year scraped from a biography page).
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\([^)]+\)/;

// ── Source image cards — horizontal scroll of real og:images from crawled pages
function SourceImageCards({ sources }: { sources: Source[] }) {
  const withImages = sources.filter(s => s.image);
  if (withImages.length === 0) return null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft]   = useState(false);
  const [canRight, setCanRight] = useState(false);
  const sync = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };
  useEffect(() => {
    sync();
    const el = scrollRef.current;
    el?.addEventListener("scroll", sync, { passive: true });
    return () => el?.removeEventListener("scroll", sync);
  }, []);
  const pan = (dir: "l" | "r") =>
    scrollRef.current?.scrollBy({ left: dir === "r" ? 300 : -300, behavior: "smooth" });

  return (
    <div className="relative my-5 group/srcrow">
      <button onClick={() => pan("l")} className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/80 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black transition-all duration-150 ${canLeft ? "opacity-0 group-hover/srcrow:opacity-100" : "opacity-0 pointer-events-none"}`}><ChevronLeft className="w-4 h-4" /></button>
      <div ref={scrollRef} className="flex gap-2.5 overflow-x-auto select-none" style={{ scrollbarWidth: "none", scrollSnapType: "x mandatory" } as React.CSSProperties}>
        {withImages.map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 relative rounded-xl overflow-hidden bg-white/[0.04] cursor-pointer group/srccard hover:ring-1 hover:ring-white/20 transition-all"
            style={{ width: 140, height: 100, scrollSnapAlign: "start" }}
          >
            <img src={s.image!} alt={s.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover/srccard:scale-105"
              onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 px-2 pb-2 pt-4 flex items-end gap-1.5">
              <Favicon url={s.url} size={11} />
              <p className="text-[9px] font-semibold leading-snug text-white/90 line-clamp-2 truncate">{extractSiteName(s)}</p>
            </div>
          </a>
        ))}
      </div>
      <button onClick={() => pan("r")} className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/80 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black transition-all duration-150 ${canRight ? "opacity-0 group-hover/srcrow:opacity-100" : "opacity-0 pointer-events-none"}`}><ChevronRight className="w-4 h-4" /></button>
    </div>
  );
}

export function MessageContent({ content, sources, timeInfo }: MessageContentProps) {
  const cleanContent = sanitizeLinkNoise(content);
  const hasInlineImages = MARKDOWN_IMAGE_RE.test(cleanContent);
  const hasSources = sources && sources.length > 0;
  // Only show Wikipedia media cards when there are no real web sources — otherwise
  // detectMediaTitles fires on summarised page content and shows blank placeholders.
  const mediaTitles = hasInlineImages || hasSources ? [] : detectMediaTitles(cleanContent);

  return (
    <div className="text-[0.875rem] leading-relaxed text-white/90 min-w-0 overflow-hidden">

      {/* Clock widget */}
      {timeInfo && <ClockWidget timeInfo={timeInfo} />}

      {/* Real og:images from crawled sources — shown instead of Wikipedia guesses */}
      {hasSources && <SourceImageCards sources={sources!} />}

      {/* Movie / show discovery carousel — only when no web sources */}
      {mediaTitles.length >= 2 && <MediaCardsRow titles={mediaTitles} />}

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (/^data:image\//i.test(url) ? url : defaultUrlTransform(url))}
        components={{
          // ── Paragraphs — clean, no inline chips ──────────────────────────────
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 leading-[1.75] text-white/88">{children}</p>
          ),

          // ── Headings ──────────────────────────────────────────────────────────
          h1: ({ children }) => <h1 className="text-base font-bold mb-3 mt-5 first:mt-0 text-white border-b border-white/10 pb-1.5">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[0.9rem] font-semibold mb-2 mt-4 first:mt-0 text-white">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-medium mb-1.5 mt-3 first:mt-0 text-white/90">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-medium mb-1 mt-2 first:mt-0 text-white/75">{children}</h4>,

          // ── Lists ─────────────────────────────────────────────────────────────
          ul: ({ children }) => <ul className="mb-3 space-y-1 pl-0 list-none">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 space-y-1 pl-0 list-none">{children}</ol>,
          li: ({ children, ...props }) => {
            const node = (props as any).node;
            // react-markdown mdast: parent list node carries `ordered: boolean`
            const ordered: boolean = node?.parent?.ordered ?? node?.parentNode?.ordered ?? false;
            const index: number = node?.parent?.children
              ? (node.parent.children as unknown[]).indexOf(node)
              : -1;
            return (
              <li className="flex gap-2.5 text-white/85 leading-relaxed items-baseline">
                {ordered
                  ? <span className="text-white/35 font-mono text-[11px] shrink-0 min-w-[18px] text-right select-none">
                      {index >= 0 ? `${index + 1}.` : "•"}
                    </span>
                  : <span className="mt-[9px] shrink-0 h-[5px] w-[5px] rounded-full bg-white/25 select-none" />
                }
                <span className="flex-1 min-w-0">{children}</span>
              </li>
            );
          },

          // ── Inline ────────────────────────────────────────────────────────────
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic text-white/70">{children}</em>,
          // Links never expose a raw URL as visible text — if the link's
          // label is empty, a bare URL, or identical to its own href (the
          // common case for autolinked plain-text URLs), it renders as a
          // clickable favicon-only chip instead. A real descriptive label
          // (e.g. "OpenAI's docs") still shows as normal underlined text.
          a: ({ href, children }) => {
            if (!href) return <>{children}</>;
            const label = childrenToText(children).trim();
            const isBareUrl = !label || label === href || /^https?:\/\//i.test(label);
            if (isBareUrl) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={getDomain(href)}
                  className="inline-flex items-center justify-center w-4 h-4 mx-0.5 align-text-bottom rounded-full overflow-hidden hover:opacity-75 transition-opacity"
                >
                  <Favicon url={href} size={14} />
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="text-white/75 underline underline-offset-2 decoration-white/20 hover:text-white hover:decoration-white/60 transition-all">
                {children}
              </a>
            );
          },
          del: ({ children }) => <del className="line-through text-white/35">{children}</del>,

          // ── Block elements ────────────────────────────────────────────────────
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/20 pl-4 my-3 text-white/50 italic text-sm py-0.5 bg-white/[0.02] rounded-r-lg">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-white/[0.08] my-5" />,
          pre: ({ children }) => <>{children}</>,

          // ── Media ─────────────────────────────────────────────────────────────
          img: ({ src, alt }) => src ? <ImageBlock src={src} alt={alt} /> : null,

          // ── Code ──────────────────────────────────────────────────────────────
          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");
            if (match?.[1] === "svg") return <SvgBlock code={code} />;
            if (match || code.includes("\n")) return <CodeBlock language={match?.[1] ?? ""} code={code} />;
            return <code className="text-[0.8em] bg-white/[0.07] text-white/85 px-1.5 py-0.5 rounded-md font-mono border border-white/[0.09]">{children}</code>;
          },

          // ── Tables ────────────────────────────────────────────────────────────
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-xl border border-white/10">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-white/[0.05] last:border-0">{children}</tr>,
          th: ({ children }) => <th className="text-left px-3 py-2.5 font-semibold text-white/70 text-[11px] uppercase tracking-wide">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-white/60 border-l border-white/[0.04] first:border-l-0">{children}</td>,
        }}
      >
        {cleanContent}
      </ReactMarkdown>

      {/* Source favicon strip — only when sources exist, shown once below content */}
      {hasSources && (
        <div className="mt-2 mb-1">
          <InlineFaviconCluster sources={sources!} />
        </div>
      )}

      {/* Action bar */}
      <MessageActions content={content} sources={sources} />
    </div>
  );
}
