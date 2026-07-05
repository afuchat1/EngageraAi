import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState, useEffect } from "react";
import { Copy, Check, ImageOff, Film } from "lucide-react";

interface MessageContentProps {
  content: string;
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
        <button
          onClick={() =>
            navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
          }
          className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/70 transition-colors"
        >
          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: "0 0 0.75rem 0.75rem",
          border: "1px solid rgba(255,255,255,0.1)",
          borderTop: "none",
          fontSize: "0.8rem",
          lineHeight: "1.6",
          background: "#1a1a1a",
        }}
        codeTagProps={{ style: { fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace" } }}
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
          <div className="flex gap-1.5">
            {[0, 150, 300].map(d => (
              <span key={d} className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
          <span className="text-xs text-white/35">Generating…</span>
        </div>
      )}
      {status === "error" && (
        <div className="w-64 h-48 rounded-xl border border-white/10 bg-[#111] flex flex-col items-center justify-center gap-2">
          <ImageOff className="h-5 w-5 text-white/20" />
          <p className="text-xs text-white/35">Image unavailable</p>
        </div>
      )}
      {(status === "loading" || status === "loaded") && (
        <img
          src={src}
          alt={alt || "Image"}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          style={{ display: status === "loaded" ? undefined : "none" }}
          className={`rounded-xl object-cover cursor-pointer transition-all ${expanded ? "max-w-full w-full" : "max-w-sm"}`}
          onClick={() => setExpanded(v => !v)}
        />
      )}
      {status === "loaded" && alt && alt !== "Image" && (
        <p className="text-[11px] text-white/35 mt-1.5 italic">{alt}</p>
      )}
    </div>
  );
}

// ── Media card row (movies / shows / albums / etc.) ───────────────────────────
interface MediaCard {
  title: string;
  year?: string;
  thumbnail?: string | null;
  fetching: boolean;
}

function detectMediaTitles(content: string): string[] {
  const lines = content.split("\n");
  const titles: string[] = [];
  for (const line of lines) {
    const m = line
      .trim()
      .match(
        /^\*{0,2}\d+[.)]\s+\*{0,2}([A-Z][^(\n*:—–-]{2,45}?)\*{0,2}(?:\s*\(\d{4}\))?(?:\s*[-–—]|$)/
      );
    if (m) {
      const title = m[1].trim().replace(/\*+/g, "").replace(/\s+/g, " ");
      if (
        title.length > 4 &&
        title.includes(" ") &&
        /^[A-Z]/.test(title) &&
        !/^(Step|Part|Section|Chapter|Option|Note|Example|Important|Warning|Tip|Reason|First|Second|Third|Then|Next|Finally|Also|However)\s/i.test(title)
      ) {
        titles.push(title);
      }
    }
  }
  return titles.length >= 2 ? titles.slice(0, 8) : [];
}

function MediaCardsRow({ titles }: { titles: string[] }) {
  const [cards, setCards] = useState<MediaCard[]>(
    titles.map(t => ({ title: t, fetching: true, thumbnail: null }))
  );

  useEffect(() => {
    titles.forEach((title, idx) => {
      const slug = encodeURIComponent(title.replace(/\s+/g, "_"));
      const tryFetch = (url: string) =>
        fetch(url, { signal: AbortSignal.timeout(6000) }).then(r =>
          r.ok ? r.json() : Promise.reject()
        );

      tryFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}_film`)
        .catch(() =>
          tryFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`)
        )
        .catch(() =>
          tryFetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}_TV_series`
          )
        )
        .then(data => {
          setCards(prev =>
            prev.map((c, i) =>
              i === idx
                ? {
                    ...c,
                    fetching: false,
                    thumbnail: data.thumbnail?.source ?? null,
                    year: data.description?.match(/\d{4}/)?.[0],
                  }
                : c
            )
          );
        })
        .catch(() => {
          setCards(prev =>
            prev.map((c, i) => (i === idx ? { ...c, fetching: false } : c))
          );
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-2 my-4 -mx-1 px-1"
      style={{ scrollbarWidth: "none" }}
    >
      {cards.map((card, i) => (
        <div
          key={i}
          className="shrink-0 w-28 rounded-xl overflow-hidden border border-white/10 bg-white/[0.03]"
        >
          <div className="w-28 h-40 relative bg-white/[0.05]">
            {card.fetching ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-5 h-5 border border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            ) : card.thumbnail ? (
              <img
                src={card.thumbnail}
                alt={card.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="w-6 h-6 text-white/15" />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
          </div>
          <div className="p-2">
            <p className="text-[10px] font-medium leading-tight text-white/75 line-clamp-2">
              {card.title}
            </p>
            {card.year && (
              <p className="text-[10px] text-white/30 mt-0.5">{card.year}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function MessageContent({ content }: MessageContentProps) {
  const mediaTitles = detectMediaTitles(content);

  return (
    <div className="text-[0.875rem] leading-relaxed text-white/90 min-w-0 overflow-hidden">
      {/* Media cards above text when 2+ ranked items detected */}
      {mediaTitles.length >= 2 && <MediaCardsRow titles={mediaTitles} />}

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <div className="mb-3 last:mb-0 leading-[1.75] text-white/88">
              {children}
            </div>
          ),
          h1: ({ children }) => (
            <h1 className="text-base font-bold mb-3 mt-5 first:mt-0 text-white border-b border-white/10 pb-1.5">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-semibold mb-2 mt-4 first:mt-0 text-white">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-medium mb-2 mt-3 first:mt-0 text-white/90">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 space-y-1.5 pl-0 list-none">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol
              className="mb-3 space-y-1.5 pl-0 list-none"
              style={{ counterReset: "list-counter" }}
            >
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => {
            const node = (props as any).node;
            const isOrdered =
              node?.parentNode?.tagName === "ol" ||
              node?.parent?.tagName === "ol";
            return (
              <li className="flex gap-2.5 text-white/85 leading-relaxed">
                {isOrdered ? (
                  <span className="text-white/30 font-mono text-xs mt-0.5 shrink-0">
                    •
                  </span>
                ) : (
                  <span className="text-white/30 mt-2 shrink-0 h-1.5 w-1.5 rounded-full bg-current" />
                )}
                <span>{children}</span>
              </li>
            );
          },
          strong: ({ children }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-white/70">{children}</em>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 underline underline-offset-2 decoration-white/25 hover:text-white hover:decoration-white transition-all"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/20 pl-4 my-3 text-white/55 italic text-sm py-1 bg-white/[0.02] rounded-r-lg">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-white/10 my-5" />,
          pre: ({ children }) => <>{children}</>,
          img: ({ src, alt }) => (src ? <ImageBlock src={src} alt={alt} /> : null),
          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");
            if (match?.[1] === "svg") return <SvgBlock code={code} />;
            if (match || code.includes("\n"))
              return <CodeBlock language={match?.[1] ?? ""} code={code} />;
            return (
              <code className="text-[0.8em] bg-white/[0.08] text-white/85 px-1.5 py-0.5 rounded-md font-mono border border-white/10">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-xl border border-white/10">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/[0.04]">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-white/[0.06] last:border-0">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="text-left px-3 py-2.5 font-semibold text-white/75 text-xs">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-white/60 border-l border-white/[0.04] first:border-l-0">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
