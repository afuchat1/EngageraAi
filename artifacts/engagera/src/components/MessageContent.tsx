import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState, useEffect, useRef } from "react";
import {
  Copy, Check, ImageOff, Film,
  ThumbsUp, ThumbsDown, Volume2, VolumeX,
  Share2, Globe, FileDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { TimeInfo } from "@/hooks/useEdgeChatCompletion";

export interface Source {
  title: string;
  url: string;
  snippet?: string;
}

interface MessageContentProps {
  content: string;
  sources?: Source[];
  timeInfo?: TimeInfo;
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

// ── Inline favicon cluster (appears at end of last paragraph) ─────────────────
function InlineFaviconCluster({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  const shown = sources.slice(0, 4);
  const extra = sources.length - shown.length;
  return (
    <span
      className="inline-flex items-center gap-0.5 ml-1.5 align-middle relative"
      style={{ top: -1 }}
    >
      <span className="flex items-center">
        {shown.map((s, i) => (
          <span
            key={i}
            className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border-2 border-black bg-white/10 overflow-hidden"
            style={{ marginLeft: i > 0 ? -5 : 0, zIndex: shown.length - i }}
          >
            <Favicon url={s.url} size={12} />
          </span>
        ))}
      </span>
      {extra > 0 && (
        <span className="text-[10px] text-white/30 ml-0.5">+{extra}</span>
      )}
    </span>
  );
}

// ── Source domain popup (shows on "Sources" click) ────────────────────────────
function SourcesPopup({ sources, onClose }: { sources: Source[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 mb-2 z-50 bg-[#111] border border-white/10 rounded-2xl p-3 shadow-xl min-w-[180px]"
    >
      <p className="text-[10px] text-white/30 mb-2 font-medium uppercase tracking-widest">Sources</p>
      <div className="flex flex-col gap-2">
        {sources.slice(0, 8).map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 group"
          >
            <span className="w-5 h-5 rounded-full border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
              <Favicon url={s.url} size={12} />
            </span>
            <span className="text-xs text-white/50 group-hover:text-white/80 transition-colors truncate">
              {getDomain(s.url)}
            </span>
          </a>
        ))}
      </div>
    </div>
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
            <SourcesPopup sources={sources} onClose={() => setSourcesOpen(false)} />
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

// ── SVG renderer ──────────────────────────────────────────────────────────────
function SvgBlock({ code }: { code: string }) {
  const [expanded, setExpanded] = useState(false);
  const ref = (node: HTMLDivElement | null) => {
    if (!node) return;
    const safe = code
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/on\w+="[^"]*"/gi, "")
      .replace(/on\w+='[^']*'/gi, "");
    node.innerHTML = safe;
    const svg = node.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%");
      svg.style.maxWidth = expanded ? "100%" : "400px"; svg.style.height = "auto";
    }
  };
  return (
    <div className="my-3">
      <div ref={ref} className={`rounded-xl overflow-hidden border border-white/10 bg-[#111] cursor-pointer ${expanded ? "max-w-full" : "max-w-sm"}`} onClick={() => setExpanded(v => !v)} />
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
        <img key={attempt} src={attemptSrc} alt={alt || "Image"} onLoad={() => setStatus("loaded")} onError={handleError}
          style={{ display: status === "loaded" ? undefined : "none" }}
          className={`rounded-xl object-cover cursor-pointer ${expanded ? "max-w-full w-full" : "max-w-sm"}`}
          onClick={() => setExpanded(v => !v)} />
      )}
      {status === "loaded" && alt && alt !== "Image" && <p className="text-[11px] text-white/35 mt-1.5 italic">{alt}</p>}
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

export function MessageContent({ content, sources, timeInfo }: MessageContentProps) {
  const hasInlineImages = MARKDOWN_IMAGE_RE.test(content);
  const mediaTitles = hasInlineImages ? [] : detectMediaTitles(content);
  const hasSources = sources && sources.length > 0;

  return (
    <div className="text-[0.875rem] leading-relaxed text-white/90 min-w-0 overflow-hidden">

      {/* Clock widget */}
      {timeInfo && <ClockWidget timeInfo={timeInfo} />}

      {/* Movie / show discovery carousel */}
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
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer"
              className="text-white/75 underline underline-offset-2 decoration-white/20 hover:text-white hover:decoration-white/60 transition-all">
              {children}
            </a>
          ),
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
        {content}
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
