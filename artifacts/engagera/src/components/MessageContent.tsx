import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState, useEffect } from "react";
import { Copy, Check, ImageOff, ExternalLink, Film, ChevronDown, ChevronUp } from "lucide-react";

export interface Source {
  title: string;
  url: string;
  snippet?: string;
}

interface MessageContentProps {
  content: string;
  sources?: Source[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getFavicon(url: string, size = 16) {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`;
  } catch {
    return null;
  }
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.style.maxWidth = expanded ? "100%" : "400px";
      svg.style.height = "auto";
    }
  };
  return (
    <div className="my-3">
      <div
        ref={ref}
        className={`rounded-xl overflow-hidden border border-white/10 bg-[#111] cursor-pointer ${expanded ? "max-w-full" : "max-w-sm"}`}
        onClick={() => setExpanded(v => !v)}
      />
      <p className="text-[11px] text-white/30 mt-1.5">AI-generated image · click to {expanded ? "shrink" : "expand"}</p>
    </div>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative my-3 overflow-hidden rounded-xl">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e] border border-white/10 rounded-t-xl">
        <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider">{language || "code"}</span>
        <button
          onClick={() => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
          className="flex items-center gap-1.5 text-[10px] text-white/40 hover:text-white transition-colors"
        >
          {copied ? <><Check className="h-3 w-3" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: "0 0 0.75rem 0.75rem", border: "1px solid rgba(255,255,255,0.1)", borderTop: "none", fontSize: "0.8rem", lineHeight: "1.6", background: "#1a1a1a" }}
        codeTagProps={{ style: { fontFamily: "'JetBrains Mono', Fira Code, Consolas, monospace" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ── Image block ───────────────────────────────────────────────────────────────
function ImageBlock({ src, alt }: { src: string; alt?: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="my-3">
      {status === "loading" && (
        <div className="w-64 h-48 rounded-xl border border-white/10 bg-[#111] flex flex-col items-center justify-center gap-3">
          <div className="flex gap-1.5">{[0,150,300].map(d => <span key={d} className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce" style={{animationDelay:`${d}ms`}}/>)}</div>
          <span className="text-xs text-white/40">Generating image…</span>
        </div>
      )}
      {status === "error" && (
        <div className="w-64 h-48 rounded-xl border border-white/10 bg-[#111] flex flex-col items-center justify-center gap-3">
          <ImageOff className="h-6 w-6 text-white/20" />
          <p className="text-xs text-white/40">Image failed to load</p>
        </div>
      )}
      {(status === "loading" || status === "loaded") && (
        <img src={src} alt={alt || "Generated image"} onLoad={() => setStatus("loaded")} onError={() => setStatus("error")}
          style={{ display: status === "loaded" ? undefined : "none" }}
          className={`rounded-xl object-cover cursor-pointer ${expanded ? "max-w-full w-full" : "max-w-sm"}`}
          onClick={() => setExpanded(v => !v)} />
      )}
      {status === "loaded" && alt && alt !== "Generated image" && <p className="text-[11px] text-white/40 mt-1.5 italic">{alt}</p>}
    </div>
  );
}

// ── Inline citation chips (appear inside paragraph text) ──────────────────────
function InlineCitations({ sources }: { sources: Source[] }) {
  const first = sources[0];
  const extra = sources.length - 1;
  if (!first) return null;
  const domain = getDomain(first.url);
  const favicon = getFavicon(first.url, 12);
  return (
    <a
      href={first.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full border border-white/15 bg-white/[0.06] hover:bg-white/10 transition-colors align-middle relative -top-px"
      style={{ fontSize: "11px", lineHeight: 1 }}
    >
      {favicon && <img src={favicon} alt="" className="w-3 h-3 rounded-sm shrink-0" onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />}
      <span className="text-white/55 hover:text-white/80">{domain}</span>
      {extra > 0 && <span className="text-white/30">+{extra}</span>}
    </a>
  );
}

// ── Rich source card ──────────────────────────────────────────────────────────
function SourceCard({ source }: { source: Source }) {
  const domain = getDomain(source.url);
  const favicon = getFavicon(source.url, 24);
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-xl border border-white/10 hover:bg-white/5 hover:border-white/20 transition-all group"
    >
      <div className="shrink-0 w-8 h-8 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden">
        {favicon
          ? <img src={favicon} alt="" className="w-5 h-5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />
          : <ExternalLink className="w-4 h-4 text-white/30" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-white/35 mb-0.5">{domain}</p>
        <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors line-clamp-2 leading-snug">
          {source.title || source.url}
        </p>
      </div>
    </a>
  );
}

// ── Full sources panel ────────────────────────────────────────────────────────
function SourcesPanel({ sources }: { sources: Source[] }) {
  const [showMore, setShowMore] = useState(false);
  const primary = sources.slice(0, 2);
  const more = sources.slice(2);

  return (
    <div className="mt-5 pt-4 border-t border-white/10">
      <p className="text-sm font-semibold mb-3 text-white/90">Sources</p>
      <div className="space-y-2">
        {primary.map((s, i) => <SourceCard key={i} source={s} />)}
      </div>
      {more.length > 0 && (
        <>
          <button
            onClick={() => setShowMore(v => !v)}
            className="flex items-center gap-1.5 mt-3 text-xs text-white/35 hover:text-white/60 transition-colors"
          >
            {showMore ? <><ChevronUp className="w-3.5 h-3.5"/>Hide</> : <><ChevronDown className="w-3.5 h-3.5"/>More ({more.length})</>}
          </button>
          {showMore && (
            <div className="mt-2 space-y-2">
              <p className="text-[11px] text-white/25 mb-1.5">More</p>
              {more.map((s, i) => <SourceCard key={i} source={s} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Media card horizontal scroll ──────────────────────────────────────────────
interface MediaCard { title: string; year?: string; thumbnail?: string | null; fetching: boolean; }

function detectMediaTitles(content: string): string[] {
  const lines = content.split("\n");
  const titles: string[] = [];
  for (const line of lines) {
    const m = line.trim().match(/^\*{0,2}\d+[.)]\s+\*{0,2}([A-Z][^(\n*:—–-]{2,45}?)\*{0,2}(?:\s*\(\d{4}\))?(?:\s*[-–—]|$)/);
    if (m) {
      const title = m[1].trim().replace(/\*+/g, "").replace(/\s+/g, " ");
      if (title.length > 4 && title.includes(" ") && /^[A-Z]/.test(title) &&
          !/^(Step|Part|Section|Chapter|Option|Note|Example|Important|Warning|Tip|Reason|First|Second|Third|Then|Next|Finally|Also|However)\s/i.test(title)) {
        titles.push(title);
      }
    }
  }
  return titles.length >= 2 ? titles.slice(0, 8) : [];
}

function MediaCardsRow({ titles }: { titles: string[] }) {
  const [cards, setCards] = useState<MediaCard[]>(titles.map(t => ({ title: t, fetching: true, thumbnail: null })));

  useEffect(() => {
    titles.forEach((title, idx) => {
      const slug = encodeURIComponent(title.replace(/\s+/g, "_"));
      const tryFetch = (url: string) => fetch(url, { signal: AbortSignal.timeout(6000) }).then(r => r.ok ? r.json() : Promise.reject());
      tryFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}_film`)
        .catch(() => tryFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`))
        .catch(() => tryFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}_TV_series`))
        .then(data => {
          setCards(prev => prev.map((c, i) => i === idx
            ? { ...c, fetching: false, thumbnail: data.thumbnail?.source ?? null, year: data.description?.match(/\d{4}/)?.[0] }
            : c));
        })
        .catch(() => setCards(prev => prev.map((c, i) => i === idx ? { ...c, fetching: false } : c)));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 my-4 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
      {cards.map((card, i) => (
        <div key={i} className="shrink-0 w-28 rounded-xl overflow-hidden border border-white/10 bg-white/[0.03]">
          <div className="w-28 h-40 relative bg-white/5">
            {card.fetching
              ? <div className="w-full h-full flex items-center justify-center"><div className="w-5 h-5 border border-white/20 border-t-white/60 rounded-full animate-spin" /></div>
              : card.thumbnail
                ? <img src={card.thumbnail} alt={card.title} className="w-full h-full object-cover" loading="lazy" />
                : <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-white/20" /></div>
            }
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
          </div>
          <div className="p-2">
            <p className="text-[10px] font-medium leading-tight text-white/80 line-clamp-2">{card.title}</p>
            {card.year && <p className="text-[10px] text-white/30 mt-0.5">{card.year}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Paragraph with optional inline citation at end ────────────────────────────
function ParagraphWithCitation({
  children,
  isLast,
  sources,
}: {
  children: React.ReactNode;
  isLast: boolean;
  sources?: Source[];
}) {
  return (
    <div className="mb-3 last:mb-0 leading-relaxed text-white/90">
      {children}
      {isLast && sources && sources.length > 0 && <InlineCitations sources={sources} />}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function MessageContent({ content, sources }: MessageContentProps) {
  const mediaTitles = detectMediaTitles(content);

  // Count paragraphs so we can target the last one for inline citation
  const paragraphCount = (content.match(/\n\n/g) || []).length + 1;
  let paragraphIdx = 0;

  return (
    <div className="text-[0.875rem] leading-relaxed text-white/90 min-w-0 overflow-hidden">
      {/* Media cards above text when 2+ ranked media items detected */}
      {mediaTitles.length >= 2 && <MediaCardsRow titles={mediaTitles} />}

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => {
            paragraphIdx++;
            const isLast = paragraphIdx === paragraphCount;
            return (
              <ParagraphWithCitation isLast={isLast} sources={sources}>
                {children}
              </ParagraphWithCitation>
            );
          },
          h1: ({ children }) => <h1 className="text-base font-bold mb-3 mt-5 first:mt-0 text-white border-b border-white/10 pb-1.5">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold mb-2 mt-4 first:mt-0 text-white">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-medium mb-2 mt-3 first:mt-0 text-white/90">{children}</h3>,
          ul: ({ children }) => <ul className="mb-3 space-y-1.5 pl-0 list-none">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 space-y-1.5 pl-0 list-none" style={{ counterReset: "list-counter" }}>{children}</ol>,
          li: ({ children, ...props }) => {
            const node = (props as any).node;
            const isOrdered = node?.parentNode?.tagName === "ol" || node?.parent?.tagName === "ol";
            return (
              <li className="flex gap-2 text-white/85 leading-relaxed">
                {isOrdered
                  ? <span className="text-white/35 font-mono text-xs mt-0.5 shrink-0">•</span>
                  : <span className="text-white/35 mt-2 shrink-0 h-1.5 w-1.5 rounded-full bg-current" />}
                <span>{children}</span>
              </li>
            );
          },
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic text-white/70">{children}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2 decoration-white/30 hover:decoration-white transition-all">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/25 pl-4 my-3 text-white/60 italic text-sm py-1 bg-white/[0.02] rounded-r-lg">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-white/10 my-4" />,
          pre: ({ children }) => <>{children}</>,
          img: ({ src, alt }) => src ? <ImageBlock src={src} alt={alt} /> : null,
          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");
            if (match?.[1] === "svg") return <SvgBlock code={code} />;
            if (match || code.includes("\n")) return <CodeBlock language={match?.[1] ?? ""} code={code} />;
            return <code className="text-[0.8em] bg-white/10 text-white/90 px-1.5 py-0.5 rounded-md font-mono border border-white/10">{children}</code>;
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-white/10">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/5">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-white/[0.06] last:border-0">{children}</tr>,
          th: ({ children }) => <th className="text-left px-3 py-2.5 font-semibold text-white/80 text-xs">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-white/65 border-l border-white/[0.04] first:border-l-0">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>

      {/* Rich sources panel below the full message */}
      {sources && sources.length > 0 && <SourcesPanel sources={sources} />}
    </div>
  );
}
