import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState } from "react";
import { Copy, Check, ZoomIn, RefreshCw, ImageOff } from "lucide-react";

interface MessageContentProps {
  content: string;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative my-3 group">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e] border border-white/[0.08] rounded-t-md">
        <span className="text-[10px] text-muted-foreground/60 font-mono uppercase tracking-wider">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: "0 0 0.375rem 0.375rem",
          border: "1px solid rgba(255,255,255,0.08)",
          borderTop: "none",
          fontSize: "0.8rem",
          lineHeight: "1.6",
          background: "#1a1a1a",
        }}
        codeTagProps={{
          style: { fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace" },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function ImageBlock({ src, alt }: { src: string; alt?: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [retrySeed, setRetrySeed] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const retrySrc = retrySeed > 0
    ? src.replace(/[?&]seed=\d+/, (m) => m.replace(/\d+/, String(Date.now())))
    : src;

  const handleRetry = () => {
    setStatus("loading");
    setRetrySeed((s) => s + 1);
  };

  return (
    <div className="my-3">
      {status === "loading" && (
        <div className="w-64 h-48 rounded-lg border border-white/[0.08] bg-[#1a1a1a] flex flex-col items-center justify-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-xs text-muted-foreground/50">Generating image…</span>
        </div>
      )}

      {status === "error" && (
        <div className="w-64 h-48 rounded-lg border border-white/[0.08] bg-[#1a1a1a] flex flex-col items-center justify-center gap-3">
          <ImageOff className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground/50">Image failed to load</p>
          <button
            onClick={handleRetry}
            className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Try again
          </button>
        </div>
      )}

      {/* img is only mounted once loaded to avoid native broken-image rendering */}
      {(status === "loading" || status === "loaded") && (
        <img
          key={retrySeed}
          src={retrySrc}
          alt={alt || "Generated image"}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          style={{ display: status === "loaded" ? undefined : "none" }}
          className={`rounded-lg object-cover transition-all cursor-pointer ${expanded ? "max-w-full w-full" : "max-w-sm"}`}
          onClick={() => setExpanded((v) => !v)}
        />
      )}

      {status === "loaded" && alt && alt !== "Generated image" && (
        <p className="text-[11px] text-muted-foreground/50 mt-1.5 italic">{alt}</p>
      )}
    </div>
  );
}

export function MessageContent({ content }: MessageContentProps) {
  return (
    <div className="prose-sm text-[0.875rem] leading-relaxed text-foreground/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <div className="mb-3 last:mb-0 leading-relaxed text-foreground/90">{children}</div>
          ),

          h1: ({ children }) => (
            <h1 className="text-base font-semibold mb-3 mt-5 first:mt-0 text-foreground border-b border-white/[0.06] pb-1.5">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-semibold mb-2 mt-4 first:mt-0 text-foreground">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-medium mb-2 mt-3 first:mt-0 text-foreground">{children}</h3>
          ),

          ul: ({ children }) => (
            <ul className="mb-3 space-y-1 pl-0 list-none">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 space-y-1 pl-0 list-none" style={{ counterReset: "list-counter" }}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => {
            const node = (props as any).node;
            const isOrdered = node?.parentNode?.tagName === "ol" || node?.parent?.tagName === "ol";
            return (
              <li className="flex gap-2 text-foreground/85 leading-relaxed">
                {isOrdered ? (
                  <span className="text-primary/60 font-mono text-xs mt-0.5 shrink-0 w-4">•</span>
                ) : (
                  <span className="text-primary/50 mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-current" />
                )}
                <span>{children}</span>
              </li>
            );
          },

          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/80">{children}</em>
          ),

          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              {children}
            </a>
          ),

          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/30 pl-3 my-3 text-muted-foreground italic text-sm">
              {children}
            </blockquote>
          ),

          hr: () => <hr className="border-white/[0.08] my-4" />,

          pre: ({ children }) => <>{children}</>,

          img: ({ src, alt }) =>
            src ? <ImageBlock src={src} alt={alt} /> : null,

          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");

            if (match || code.includes("\n")) {
              return <CodeBlock language={match?.[1] ?? ""} code={code} />;
            }

            return (
              <code className="text-[0.8em] bg-[#1e1e1e] text-[#e06c75] px-1.5 py-0.5 rounded font-mono border border-white/[0.06]">
                {children}
              </code>
            );
          },

          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-md border border-white/[0.08]">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#1a1a1a]">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-white/[0.06] last:border-0">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="text-left px-3 py-2 font-medium text-foreground/80 text-xs">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-foreground/70 border-l border-white/[0.04] first:border-l-0">
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
