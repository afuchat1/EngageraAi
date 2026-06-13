export type EngageraModel =
  | "engagera-lite"
  | "engagera-pro"
  | "engagera-reason"
  | "engagera-code"
  | "engagera-vision"
  | "engagera-voice"
  | "engagera-image";

interface AttachmentHint {
  kind: "image" | "text";
}

export function detectModel(text: string, attachments: AttachmentHint[] = []): EngageraModel {
  if (attachments.some((a) => a.kind === "image")) return "engagera-vision";

  const lower = text.toLowerCase();

  const imageKeywords = [
    "generate image", "create image", "draw ", "illustrate", "make a picture",
    "make an image", "design an image", "show me a picture", "generate a picture",
    "paint ", "sketch ", "render an image", "create a visual",
  ];
  if (imageKeywords.some((k) => lower.includes(k))) return "engagera-image";

  const codeKeywords = [
    "code", "function", "class ", "debug", " bug", "error", "script",
    "programming", "javascript", "python", "typescript", "css", "html",
    "react", "node.js", "nodejs", "algorithm", "recursion", "loop ",
    "variable", "syntax", "compile", "runtime", "stacktrace", "exception",
    "refactor", "implement", "unit test", "jest", "sql", "query",
    "schema", "git ", "api endpoint", "webhook", "regex", "bash ",
    "terminal", "command line", "dockerfile", "kubernetes",
  ];
  if (codeKeywords.some((k) => lower.includes(k))) return "engagera-code";

  const reasonKeywords = [
    "why ", "analyze", "analyse", "compare ", "step by step",
    "step-by-step", " prove", "proof", "logic ", "reasoning",
    "derive", "calculate", "mathematics", "equation", "theorem",
    "hypothesis", "explain in detail", "deep dive", "break down",
    "critically", "evaluate ", "pros and cons", "trade-off", "tradeoff",
    "which is better", "should i", "decision", "strategy",
  ];
  if (reasonKeywords.some((k) => lower.includes(k))) return "engagera-reason";

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount <= 6) return "engagera-lite";

  return "engagera-pro";
}
