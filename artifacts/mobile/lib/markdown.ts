/**
 * A small, streaming-safe markdown parser tailored to chat responses.
 *
 * Goals:
 *  - Separate structure clearly: headings, paragraphs, bullet lists,
 *    numbered lists, blockquotes, and code blocks are distinct blocks
 *    instead of one wall of text.
 *  - Bullets always render as a clean "•" glyph, never a raw "-" or "*".
 *  - Safe to re-parse on every token while streaming: an unterminated
 *    code fence or list simply renders as far as it has arrived, with no
 *    thrown errors or flicker between renders.
 */

export type InlineSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; inline: InlineSegment[] }
  | { type: 'paragraph'; inline: InlineSegment[] }
  | { type: 'bullet-list'; items: InlineSegment[][] }
  | { type: 'numbered-list'; items: { marker: string; inline: InlineSegment[] }[] }
  | { type: 'blockquote'; inline: InlineSegment[] }
  | { type: 'code'; code: string; lang?: string }
  | { type: 'image'; alt: string; url: string };

const HEADING_RE = /^ {0,3}(#{1,3})\s+(.*)$/;
const BULLET_RE = /^ {0,3}[-*+]\s+(.*)$/;
const NUMBERED_RE = /^ {0,3}(\d{1,3}[.)])\s+(.*)$/;
const BLOCKQUOTE_RE = /^ {0,3}>\s?(.*)$/;
const FENCE_RE = /^ {0,3}```\s*([a-zA-Z0-9_-]*)\s*$/;
// A line that is *only* a markdown image — `![alt](url)` — with nothing
// else around it. This is how generated images/SVG-art arrive from the
// chat backend, always on their own line.
const STANDALONE_IMAGE_RE = /^!\[([^\]]*)\]\((\S+)\)$/;

/** Splits inline text into bold/italic/code segments, in source order. */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  // Order matters: code first (its contents are literal), then bold before
  // italic so "**x**" isn't mistaken for an unmatched "*x*" pair.
  const re = /`([^`]+)`|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|!?\[([^\]]*)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushPlain = (s: string) => {
    if (s) segments.push({ text: s });
  };

  while ((match = re.exec(text))) {
    pushPlain(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) segments.push({ text: match[1], code: true });
    else if (match[2] !== undefined) segments.push({ text: match[2], bold: true, italic: true });
    else if (match[3] !== undefined) segments.push({ text: match[3], bold: true });
    else if (match[4] !== undefined) segments.push({ text: match[4], bold: true });
    else if (match[5] !== undefined) segments.push({ text: match[5], italic: true });
    else if (match[6] !== undefined) segments.push({ text: match[6], italic: true });
    else if (match[7] !== undefined) segments.push({ text: match[7] || match[8] || '' });
    lastIndex = re.lastIndex;
  }
  pushPlain(text.slice(lastIndex));
  return segments.length > 0 ? segments : [{ text: '' }];
}

/** Parses a full markdown string into ordered structural blocks. */
export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];

  let i = 0;
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length === 0) return;
    const text = paragraphBuf.join(' ').trim();
    paragraphBuf = [];
    if (text) blocks.push({ type: 'paragraph', inline: parseInline(text) });
  };

  while (i < lines.length) {
    const line = lines[i];

    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      flushParagraph();
      const lang = fenceMatch[1] || undefined;
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      // Whether or not the closing fence has arrived yet (still streaming),
      // show whatever code has been received so far.
      blocks.push({ type: 'code', code: codeLines.join('\n'), lang });
      i += 1; // skip closing fence if present
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, inline: parseInline(headingMatch[2].trim()) });
      i += 1;
      continue;
    }

    if (BULLET_RE.test(line)) {
      flushParagraph();
      const items: InlineSegment[][] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        const m = lines[i].match(BULLET_RE)!;
        items.push(parseInline(m[1].trim()));
        i += 1;
      }
      blocks.push({ type: 'bullet-list', items });
      continue;
    }

    if (NUMBERED_RE.test(line)) {
      flushParagraph();
      const items: { marker: string; inline: InlineSegment[] }[] = [];
      while (i < lines.length && NUMBERED_RE.test(lines[i])) {
        const m = lines[i].match(NUMBERED_RE)!;
        items.push({ marker: m[1], inline: parseInline(m[2].trim()) });
        i += 1;
      }
      blocks.push({ type: 'numbered-list', items });
      continue;
    }

    if (BLOCKQUOTE_RE.test(line)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && BLOCKQUOTE_RE.test(lines[i])) {
        quoteLines.push(lines[i].match(BLOCKQUOTE_RE)![1]);
        i += 1;
      }
      blocks.push({ type: 'blockquote', inline: parseInline(quoteLines.join(' ').trim()) });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      i += 1;
      continue;
    }

    const imageMatch = line.trim().match(STANDALONE_IMAGE_RE);
    if (imageMatch) {
      flushParagraph();
      blocks.push({ type: 'image', alt: imageMatch[1], url: imageMatch[2] });
      i += 1;
      continue;
    }

    paragraphBuf.push(line.trim());
    i += 1;
  }

  flushParagraph();
  return blocks;
}
