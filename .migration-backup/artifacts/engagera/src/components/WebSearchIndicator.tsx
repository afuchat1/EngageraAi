import { useState } from "react";
import { Globe, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import type { SearchInfo, SearchSource } from "@/hooks/useEdgeChatCompletion";

function getFaviconUrl(url: string): string {
  try {
    const { hostname } = new URL(url);
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  } catch {
    return "";
  }
}

function getFaviconFallback(url: string): string {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return "";
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 30);
  }
}

function getSiteName(source: SearchSource): string {
  if (source.title) {
    const parts = source.title.split(" - ");
    if (parts.length > 1) return parts[parts.length - 1].trim();
    const parts2 = source.title.split(" | ");
    if (parts2.length > 1) return parts2[parts2.length - 1].trim();
  }
  return getDomain(source.url);
}

function Favicon({ url, size = 16 }: { url: string; size?: number }) {
  const [src, setSrc] = useState(() => getFaviconUrl(url));
  const [tries, setTries] = useState(0);

  if (!src || tries >= 2) {
    return (
      <div
        className="rounded-full bg-white/10 flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <Globe style={{ width: size * 0.65, height: size * 0.65 }} className="text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="rounded-full object-contain shrink-0 bg-white/5"
      style={{ width: size, height: size }}
      onError={() => {
        if (tries === 0) {
          setSrc(getFaviconFallback(url));
          setTries(1);
        } else {
          setTries(2);
        }
      }}
    />
  );
}

function SourceCard({ source, index }: { source: SearchSource; index: number }) {
  const siteName = getSiteName(source);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-0 min-w-[200px] max-w-[220px] shrink-0 rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.13] transition-all overflow-hidden cursor-pointer"
    >
      {/* Real og:image banner when available */}
      {source.image && !imgFailed && (
        <div className="w-full h-[90px] overflow-hidden bg-white/[0.03] shrink-0">
          <img
            src={source.image}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgFailed(true)}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2 min-w-0">
          <Favicon url={source.url} size={18} />
          <span className="text-[11px] text-muted-foreground/70 truncate font-medium flex-1 min-w-0">
            {siteName}
          </span>
          <ExternalLink className="h-3 w-3 text-muted-foreground/20 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <p className="text-[12px] font-semibold text-foreground/90 leading-snug line-clamp-2">
          {source.title}
        </p>

        {source.snippet && (
          <p className="text-[11px] text-muted-foreground/55 leading-snug line-clamp-2">
            {source.snippet}
          </p>
        )}

        <div className="flex items-center gap-1.5 mt-auto pt-1">
          <Favicon url={source.url} size={13} />
          <span className="text-[10px] text-muted-foreground/40 truncate font-mono">
            {getDomain(source.url)}
          </span>
        </div>
      </div>
    </a>
  );
}

interface WebSearchIndicatorProps {
  searchInfo: SearchInfo;
}

export function WebSearchIndicator({ searchInfo }: WebSearchIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const sources = searchInfo.sources ?? [];
  const hasMore = sources.length > 3;

  if (sources.length === 0 && !searchInfo.query) return null;

  return (
    <div className="mb-3 space-y-2.5">
      <button
        onClick={() => sources.length > 0 && setExpanded((v) => !v)}
        className={`flex items-center gap-2.5 w-fit transition-all ${sources.length > 0 ? "cursor-pointer" : "cursor-default"}`}
      >
        {sources.length > 0 ? (
          <div className="flex items-center">
            {sources.slice(0, 4).map((s, i) => (
              <div
                key={i}
                className="rounded-full border-2 border-[#0a0a0a] overflow-hidden"
                style={{ marginLeft: i > 0 ? -6 : 0, zIndex: 4 - i, width: 22, height: 22 }}
              >
                <Favicon url={s.url} size={20} />
              </div>
            ))}
          </div>
        ) : (
          <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center">
            <Globe className="h-3 w-3 text-white" />
          </div>
        )}

        <span className="text-[12px] text-muted-foreground/70 font-medium">
          {sources.length > 0
            ? `${sources.length} source${sources.length !== 1 ? "s" : ""}`
            : "Searched the web"}
        </span>

        {searchInfo.query && (
          <span className="text-[11px] text-muted-foreground/40">
            · "{searchInfo.query}"
          </span>
        )}

        {sources.length > 0 && (
          expanded
            ? <ChevronUp className="h-3 w-3 text-muted-foreground/40 shrink-0" />
            : <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
        )}
      </button>

      {expanded && sources.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-white/[0.08] scrollbar-track-transparent max-w-[min(640px,calc(80vw-2rem))]">
          {sources.map((source, i) => (
            <SourceCard key={i} source={source} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
