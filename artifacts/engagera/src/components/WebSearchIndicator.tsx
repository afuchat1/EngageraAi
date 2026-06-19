import { useState } from "react";
import { Globe, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { SearchInfo, SearchSource } from "@/hooks/useEdgeChatCompletion";

// ── Favicon via Google's public favicon service ────────────────────────────────
function Favicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  let domain = "";
  try { domain = new URL(url).hostname; } catch { /* ignore */ }

  if (!domain || failed) {
    return (
      <div className="h-4 w-4 rounded-sm bg-white/[0.08] flex items-center justify-center shrink-0">
        <Globe className="h-2.5 w-2.5 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      width={16}
      height={16}
      className="h-4 w-4 rounded-sm object-contain shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

// ── Domain display ─────────────────────────────────────────────────────────────
function domain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url.slice(0, 30); }
}

// ── Single source card ─────────────────────────────────────────────────────────
function SourceCard({ source }: { source: SearchSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-1.5 min-w-[180px] max-w-[200px] shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/[0.15] transition-all px-3 py-2.5 cursor-pointer"
    >
      {/* Domain + favicon */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Favicon url={source.url} />
        <span className="text-[10px] text-muted-foreground/60 truncate font-mono">
          {domain(source.url)}
        </span>
        <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Title */}
      <p className="text-[11px] font-medium text-foreground/85 leading-snug line-clamp-2">
        {source.title}
      </p>

      {/* Snippet */}
      {source.snippet && (
        <p className="text-[10px] text-muted-foreground/50 leading-snug line-clamp-2">
          {source.snippet}
        </p>
      )}
    </a>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
interface WebSearchIndicatorProps {
  searchInfo: SearchInfo;
}

export function WebSearchIndicator({ searchInfo }: WebSearchIndicatorProps) {
  const [showSources, setShowSources] = useState(false);
  const hasSources = searchInfo.sources.length > 0;

  return (
    <div className="mb-2.5 space-y-2">
      {/* Search badge */}
      <button
        onClick={() => hasSources && setShowSources((v) => !v)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-blue-950/30 text-left w-fit transition-colors ${hasSources ? "hover:bg-blue-950/50 cursor-pointer" : "cursor-default"}`}
      >
        <Globe className="h-3 w-3 text-blue-400 shrink-0" />
        <span className="text-[11px] text-blue-300/80 font-medium">
          Searched:&nbsp;
          <span className="text-blue-200/90 font-semibold">"{searchInfo.query}"</span>
        </span>
        {hasSources && (
          <>
            <span className="text-[10px] text-blue-400/50 ml-1">
              {searchInfo.sources.length} source{searchInfo.sources.length !== 1 ? "s" : ""}
            </span>
            {showSources
              ? <ChevronUp className="h-3 w-3 text-blue-400/60 shrink-0" />
              : <ChevronDown className="h-3 w-3 text-blue-400/60 shrink-0" />
            }
          </>
        )}
      </button>

      {/* Source cards — horizontally scrollable */}
      {showSources && hasSources && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent max-w-[calc(80vw-3rem)]">
          {searchInfo.sources.map((source, i) => (
            <SourceCard key={i} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}
