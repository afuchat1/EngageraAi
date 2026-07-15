import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText, Copy, Check, ChevronDown, ChevronUp, Maximize2, Minimize2,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTitle(content: string): string {
  const headingMatch = content.match(/^#{1,3}\s+(.{3,80})$/m);
  if (headingMatch) return headingMatch[1].replace(/\*+/g, "").trim();

  const subjectMatch = content.match(/^Subject:\s*(.+)$/im);
  if (subjectMatch) return subjectMatch[1].trim();

  const boldMatch = content.match(/^\*\*(.{4,65})\*\*/m);
  if (boldMatch) return boldMatch[1].trim();

  const firstMeaningfulLine = content.split("\n").find(
    l => l.trim().length > 8 && !/^[-*#>]/.test(l.trim()),
  );
  if (firstMeaningfulLine) {
    return firstMeaningfulLine.replace(/^#+\s*/, "").trim().slice(0, 70);
  }
  return "Document";
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function readingTime(words: number) {
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

// ── DocumentBlock ─────────────────────────────────────────────────────────────

export interface DocumentBlockProps {
  content: string;
}

export function DocumentBlock({ content }: DocumentBlockProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const words   = countWords(content);
  const title   = extractTitle(content);
  const readTime = readingTime(words);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const handleDownload = (format: "txt" | "md") => {
    const mime = format === "md" ? "text/markdown" : "text/plain";
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${title.slice(0, 48).replace(/[^a-z0-9]/gi, "-").toLowerCase()}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`my-2 rounded-2xl border border-white/[0.10] bg-white/[0.025] overflow-hidden transition-all ${
        fullscreen ? "fixed inset-3 z-[200] flex flex-col shadow-2xl bg-[#0d0d0e]" : ""
      }`}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-white/[0.015] shrink-0">
        <div className="p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] shrink-0">
          <FileText className="w-3.5 h-3.5 text-white/40" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white/80 truncate leading-tight">
            {title}
          </p>
          <p className="text-[10px] text-white/30 leading-tight mt-0.5">
            {words.toLocaleString()} words · {readTime}
          </p>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => handleDownload("txt")}
            title="Download .txt"
            className="px-2 py-1 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors text-[9px] font-mono tracking-wide"
          >
            TXT
          </button>
          <button
            onClick={() => handleDownload("md")}
            title="Download Markdown"
            className="px-2 py-1 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors text-[9px] font-mono tracking-wide"
          >
            .md
          </button>
          <button
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy all"}
            className="p-1.5 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
          >
            {copied
              ? <Check className="w-3.5 h-3.5 text-emerald-400" />
              : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? "Expand" : "Collapse"}
            className="p-1.5 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
          >
            {collapsed
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setFullscreen(v => !v)}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="p-1.5 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
          >
            {fullscreen
              ? <Minimize2 className="w-3.5 h-3.5" />
              : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {!collapsed && (
        <div
          className={`overflow-y-auto px-6 py-5 text-[0.875rem] leading-relaxed text-white/80 ${
            fullscreen ? "flex-1" : "max-h-[620px]"
          }`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p:          ({ children }) => <p className="mb-3 last:mb-0 leading-[1.75] text-white/80">{children}</p>,
              h1:         ({ children }) => <h1 className="text-base font-bold mb-3 mt-5 first:mt-0 text-white border-b border-white/10 pb-2">{children}</h1>,
              h2:         ({ children }) => <h2 className="text-[0.9rem] font-semibold mb-2 mt-4 first:mt-0 text-white/90">{children}</h2>,
              h3:         ({ children }) => <h3 className="text-sm font-medium mb-1.5 mt-3 first:mt-0 text-white/80">{children}</h3>,
              strong:     ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
              em:         ({ children }) => <em className="italic text-white/70">{children}</em>,
              del:        ({ children }) => <del className="line-through text-white/35">{children}</del>,
              hr:         () => <hr className="border-white/[0.08] my-5" />,
              ul:         ({ children }) => <ul className="mb-3 space-y-1 pl-4 list-disc list-outside">{children}</ul>,
              ol:         ({ children }) => <ol className="mb-3 space-y-1 pl-4 list-decimal list-outside">{children}</ol>,
              li:         ({ children }) => <li className="text-white/80 leading-relaxed pl-0.5">{children}</li>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-white/20 pl-4 my-3 italic text-white/50 bg-white/[0.02] py-1.5 rounded-r-lg">
                  {children}
                </blockquote>
              ),
              pre: ({ children }) => <>{children}</>,
              code: ({ className, children }) => {
                const isBlock =
                  /language-/.test(className || "") || String(children).includes("\n");
                if (isBlock) {
                  return (
                    <pre className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-4 overflow-x-auto my-3 font-mono text-[0.8em] text-white/75 leading-[1.6]">
                      <code>{children}</code>
                    </pre>
                  );
                }
                return (
                  <code className="bg-white/[0.07] px-1.5 py-0.5 rounded text-[0.85em] font-mono text-white/80 border border-white/[0.08]">
                    {children}
                  </code>
                );
              },
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/65 underline underline-offset-2 decoration-white/25 hover:text-white/90 hover:decoration-white/60 transition-colors"
                >
                  {children}
                </a>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-4 rounded-xl border border-white/10">
                  <table className="w-full text-xs border-collapse">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-white/[0.05] sticky top-0">{children}</thead>,
              tbody: ({ children }) => <tbody>{children}</tbody>,
              tr:    ({ children }) => <tr className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors">{children}</tr>,
              th:    ({ children }) => <th className="text-left px-3 py-2.5 font-semibold text-white/65 text-[11px] uppercase tracking-wide border-b border-white/[0.08]">{children}</th>,
              td:    ({ children }) => <td className="px-3 py-2.5 text-white/60 border-l border-white/[0.04] first:border-l-0">{children}</td>,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
