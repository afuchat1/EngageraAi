/**
 * Strips markdown syntax down to clean plain text.
 *
 * Product decision: the mobile app never renders rich text (no bold,
 * headers, inline code styling, or bullet glyphs) — everything the model
 * sends is shown as plain, readable prose. This keeps streaming rendering
 * simple (a single Text node) and avoids any layout shift while tokens
 * are still arriving mid-markdown-token (e.g. a lone "**" that hasn't
 * been closed yet).
 */
export function toPlainText(markdown: string): string {
  return markdown
    // fenced code blocks -> keep the code content, drop the fence/lang tag
    .replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, '$1')
    // headings: "## Title" -> "Title" (with or without trailing space — handles partial lines during streaming)
    .replace(/^ {0,3}#{1,6}\s*/gm, '')
    // bold / italic emphasis markers — complete pairs first
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // inline code — complete pairs
    .replace(/`([^`]+)`/g, '$1')
    // markdown links/images -> just the label (or url if no label)
    .replace(/!?\[([^\]]*)\]\(([^)]+)\)/g, (_m, label, url) => label || url)
    // blockquote markers
    .replace(/^ {0,3}>\s?/gm, '')
    // bullet markers -> a plain dash so lists still read as lists
    .replace(/^\s*[-*+]\s+/gm, '– ')
    // numbered list markers stay as-is ("1. thing" already reads as plain text)
    // ── Strip leftover / unclosed markdown tokens (common during streaming) ──
    // These are markers that didn't form a complete pair above — e.g. a lone
    // "**" or a trailing backtick. Remove them so raw syntax never shows up.
    .replace(/\*{1,3}/g, '')
    .replace(/_{1,2}/g, '')
    .replace(/`/g, '')
    // collapse 3+ blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
