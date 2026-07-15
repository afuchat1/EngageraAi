/**
 * Engagera search backend — real-time web/image/video/news/finance results
 * aggregated from free, keyless sources:
 *
 *   - Web results & autocomplete: DuckDuckGo (html.duckduckgo.com, duckduckgo.com/ac)
 *   - News: Bing News RSS + Google News RSS + a curated list of outlets'
 *     own official RSS feeds (BBC, NPR, Al Jazeera, TechCrunch, The Verge,
 *     ESPN, NASA, ...) — merged, deduped, and ranked against the query.
 *   - Images & videos: Bing's HTML result pages (image cards / video cards)
 *     and YouTube's public search page.
 *
 * No API key is required for any of these. Every request has a timeout and
 * fails soft to an empty array — we never fabricate a result.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 6000;

// ── HTML helpers ─────────────────────────────────────────────────────────────

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function faviconFor(url: string): string {
  const host = hostOf(url);
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : "";
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function relativeTime(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Domain detection ─────────────────────────────────────────────────────────
// If the input looks like a bare domain (e.g. "afuchat.com"), the app should
// open it directly in the in-app browser instead of running a search.

export function looksLikeDomain(input: string): string | null {
  const t = input.trim();
  if (!t || /\s/.test(t)) return null;
  const stripped = t.replace(/^https?:\/\//i, "");
  const domainRe = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/[^\s]*)?$/i;
  if (!domainRe.test(stripped)) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

// ── Domain probe (official-site detection) ────────────────────────────────────
// For single-word queries (e.g. "afuchat"), tries common TLDs to see if the
// brand has a live website. Returns the first URL that responds (any HTTP
// status counts — even 403/301 — since it proves the domain exists).
// Used to pin an "Official site" card at the top of web results.

export async function probeDomain(word: string): Promise<string | null> {
  const clean = word.trim().toLowerCase();
  // Only probe single tokens — no spaces, dots, or special characters
  if (!clean || clean.length < 2 || clean.length > 63) return null;
  if (/[\s./\\@?#%]/.test(clean)) return null;
  if (!/^[a-z0-9-]+$/.test(clean)) return null;

  const candidates = [
    `https://${clean}.com`,
    `https://www.${clean}.com`,
    `https://${clean}.io`,
    `https://${clean}.org`,
    `https://${clean}.co`,
    `https://${clean}.net`,
    `https://${clean}.app`,
    `https://${clean}.ai`,
  ];

  // Race all candidates — return whichever responds first
  const probe = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(3000),
        redirect: "follow",
      });
      // Any response (2xx, 3xx, 4xx) means the domain resolves
      if (res.status < 500) return res.url || url;
    } catch { /* DNS failure or timeout — domain doesn't exist */ }
    return null;
  };

  // Run in parallel; resolve with first non-null result
  const results = await Promise.allSettled(candidates.map(probe));
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return null;
}

// ── Suggestions (DuckDuckGo autocomplete) ────────────────────────────────────

export async function fetchSuggestions(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const res = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // With type=list, DDG returns [query, [suggestion strings...]].
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return (data[1] as string[]).filter(Boolean).slice(0, 8);
    }
    // Fallback shape some DDG endpoints use: [{ phrase: "..." }, ...]
    if (Array.isArray(data)) {
      return data.map((r: Record<string, unknown>) => r?.phrase as string).filter(Boolean).slice(0, 8);
    }
    return [];
  } catch {
    return [];
  }
}

// ── Web results (DuckDuckGo HTML) ────────────────────────────────────────────

export interface WebResult {
  title: string;
  url: string;
  description: string;
  age: string | null;
  favicon: string;
  thumbnail: string | null;
}

function resolveDdgHref(href: string): string | null {
  try {
    // DDG's HTML result page wraps outbound links as
    // //duckduckgo.com/l/?uddg=<encoded-real-url>&rut=...
    if (href.includes("uddg=")) {
      const qs = href.startsWith("http") ? new URL(href).search : `?${href.split("?")[1] ?? ""}`;
      const params = new URLSearchParams(qs);
      const real = params.get("uddg");
      if (real) return decodeURIComponent(real);
    }
    return href.startsWith("http") ? href : `https:${href}`;
  } catch {
    return null;
  }
}

export async function fetchWebResults(query: string, limit = 12): Promise<WebResult[]> {
  const q = query.trim();
  if (!q) return [];
  const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
    "Content-Type": "application/x-www-form-urlencoded",
  });
  if (!html) return [];

  const titleRe = /<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const titles: { href: string; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html)) !== null) {
    const url = resolveDdgHref(decodeEntities(m[1]));
    if (url) titles.push({ href: url, title: stripTags(m[2]) });
  }
  const snippets: string[] = [];
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(stripTags(m[1]));
  }

  return titles.slice(0, limit).map((t, i) => ({
    title: t.title,
    url: t.href,
    description: snippets[i] ?? "",
    age: null,
    favicon: faviconFor(t.href),
    thumbnail: null,
  }));
}

// ── Images (Bing image search HTML) ──────────────────────────────────────────

export interface ImageResult {
  title: string;
  pageUrl: string;
  src: string;
  thumbnail: string;
  width?: number;
  height?: number;
  source: string;
}

export async function fetchImageResults(query: string, limit = 24): Promise<ImageResult[]> {
  const q = query.trim();
  if (!q) return [];
  const html = await fetchText(
    `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1&mkt=en-US`,
    {
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: "SRCHHPGUSR=SRCHLANG=en&NRSLT=-1&VIRDSVN=1; domain=.bing.com",
    },
  );
  if (!html) return [];

  const out: ImageResult[] = [];
  const seen = new Set<string>();
  const cardRe = /class="iusc"[^>]*\sm="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null && out.length < limit) {
    try {
      const data = JSON.parse(decodeEntities(m[1])) as Record<string, unknown>;
      const src = (data.murl as string) ?? "";
      if (!src || seen.has(src)) continue;
      seen.add(src);
      out.push({
        title: (data.t as string) ?? q,
        pageUrl: (data.purl as string) ?? src,
        src,
        thumbnail: (data.turl as string) ?? src,
        width: typeof data.ow === "number" ? (data.ow as number) : undefined,
        height: typeof data.oh === "number" ? (data.oh as number) : undefined,
        source: hostOf((data.purl as string) ?? src),
      });
    } catch {
      continue;
    }
  }
  return out;
}

// ── Videos (YouTube search HTML) ─────────────────────────────────────────────

export interface VideoResult {
  title: string;
  url: string;
  thumbnail: string;
  duration: string | null;
  publisher: string;
  age: string | null;
  description: string;
}

/** Walks an arbitrary ytInitialData-style JSON tree collecting videoRenderer nodes. */
function collectVideoRenderers(node: unknown, out: Record<string, unknown>[], limit: number) {
  if (!node || out.length >= limit) return;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out, limit);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.videoRenderer) out.push(obj.videoRenderer as Record<string, unknown>);
    for (const key of Object.keys(obj)) {
      if (out.length >= limit) return;
      collectVideoRenderers(obj[key], out, limit);
    }
  }
}

export async function fetchVideoResults(query: string, limit = 12): Promise<VideoResult[]> {
  const q = query.trim();
  if (!q) return [];
  const html = await fetchText(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
    "Accept-Language": "en-US,en;q=0.9",
  });
  if (!html) return [];

  const jsonMatch = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/);
  if (!jsonMatch) return [];

  try {
    const data = JSON.parse(jsonMatch[1]);
    const renderers: Record<string, unknown>[] = [];
    collectVideoRenderers(data, renderers, limit * 2);

    const out: VideoResult[] = [];
    for (const r of renderers) {
      const videoId = r.videoId as string | undefined;
      if (!videoId) continue;
      const titleRuns = (r.title as Record<string, unknown> | undefined)?.runs as
        | { text: string }[]
        | undefined;
      const title = titleRuns?.[0]?.text ?? (r.title as Record<string, unknown> | undefined)?.simpleText as string ?? q;
      const thumbs = ((r.thumbnail as Record<string, unknown> | undefined)?.thumbnails as
        | { url: string }[]
        | undefined) ?? [];
      const thumbnail = thumbs[thumbs.length - 1]?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const ownerRuns = (r.longBylineText as Record<string, unknown> | undefined)?.runs as
        | { text: string }[]
        | undefined;
      const publisher = ownerRuns?.[0]?.text ?? "YouTube";
      const duration = (r.lengthText as Record<string, unknown> | undefined)?.simpleText as string | undefined;
      const age = (r.publishedTimeText as Record<string, unknown> | undefined)?.simpleText as string | undefined;
      const descSnippet = (r.detailedMetadataSnippets as { snippetText?: { runs?: { text: string }[] } }[] | undefined)
        ?.[0]?.snippetText?.runs?.map((run) => run.text).join("") ?? "";
      out.push({
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail,
        duration: duration ?? null,
        publisher,
        age: age ?? null,
        description: descSnippet,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

// ── News (Bing News RSS + Google News RSS + curated outlet RSS) ─────────────

export interface NewsResult {
  title: string;
  url: string;
  description: string;
  thumbnail: string | null;
  source: string;
  age: string | null;
}

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  thumbnail: string | null;
  source: string;
}

function parseRssFeed(xml: string, defaultSource: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const text = (tag: string) => {
      const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
      const raw = block.match(re)?.[1] ?? "";
      return decodeEntities(raw.replace(/<[^>]*>/g, "")).trim();
    };
    const linkMatch = block.match(/<link>([^<]+)<\/link>/i);
    const link = linkMatch?.[1]?.trim() ?? "";
    const title = text("title");
    const description = text("description");
    const pubDate = text("pubDate") || null;
    // Google News RSS puts the outlet name in <source>; fall back to the default.
    const sourceMatch = block.match(/<source[^>]*>([^<]+)<\/source>/i);
    const source = sourceMatch ? decodeEntities(sourceMatch[1]).trim() : defaultSource;
    const thumbMatch =
      block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i) ??
      block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    if (title && link) {
      items.push({ title, link, description, pubDate, thumbnail: thumbMatch?.[1] ?? null, source });
    }
  }
  return items;
}

async function fetchRssFeed(feedUrl: string, defaultSource: string): Promise<FeedItem[]> {
  const xml = await fetchText(feedUrl, {
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  });
  if (!xml) return [];
  return parseRssFeed(xml, defaultSource);
}

/** Real news outlets' own official RSS feeds — read directly, alongside Bing/Google News RSS. */
const OUTLET_FEEDS: { source: string; url: string }[] = [
  { source: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "NPR", url: "https://feeds.npr.org/1001/rss.xml" },
  { source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { source: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { source: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { source: "ESPN", url: "https://www.espn.com/espn/rss/news" },
  { source: "NASA", url: "https://www.nasa.gov/news-release/feed/" },
  { source: "Reuters (via Google News)", url: "https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en" },
];

function bingNewsRssUrl(query: string): string {
  return `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`;
}

function googleNewsRssUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function scoreFeedItem(item: FeedItem, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const title = item.title.toLowerCase();
  const desc = item.description.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    if (title.includes(t)) s += 5;
    if (desc.includes(t)) s += 2;
  }
  return s;
}

function tokenize(q: string): string[] {
  return q.trim().toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

export async function fetchNewsResults(query: string, limit = 15): Promise<NewsResult[]> {
  const q = query.trim();
  const tokens = tokenize(q);

  // Bing News RSS + Google News RSS are already query-scoped; the curated
  // outlet feeds are general "latest headlines" feeds we rank/filter locally.
  const [bing, google, ...outlets] = await Promise.all([
    q ? fetchRssFeed(bingNewsRssUrl(q), "Bing News") : Promise.resolve<FeedItem[]>([]),
    q ? fetchRssFeed(googleNewsRssUrl(q), "Google News") : Promise.resolve<FeedItem[]>([]),
    ...OUTLET_FEEDS.map((f) => fetchRssFeed(f.url, f.source)),
  ]);

  const all = [bing, google, ...outlets].flat();
  const relevant = tokens.length > 0 ? all.filter((it) => scoreFeedItem(it, tokens) > 0) : all;
  const pool = relevant.length > 0 ? relevant : all;

  const seen = new Set<string>();
  return pool
    .sort((a, b) => scoreFeedItem(b, tokens) - scoreFeedItem(a, tokens))
    .filter((it) => {
      const key = it.title.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((it) => ({
      title: it.title,
      url: it.link,
      description: stripTags(it.description).slice(0, 200),
      thumbnail: it.thumbnail,
      source: it.source,
      age: relativeTime(it.pubDate),
    }));
}

// ── Finance (finance-flavored news + web) ───────────────────────────────────

export interface FinanceResult {
  kind: "web" | "news";
  title: string;
  url: string;
  description: string;
  thumbnail?: string | null;
  source: string;
  age: string | null;
}

export async function fetchFinanceResults(query: string): Promise<FinanceResult[]> {
  const [webResults, newsResults] = await Promise.all([
    fetchWebResults(`${query} stock price market`, 8),
    fetchNewsResults(`${query} stock`, 6),
  ]);

  const news: FinanceResult[] = newsResults.map((n) => ({
    kind: "news" as const,
    title: n.title,
    url: n.url,
    description: n.description,
    thumbnail: n.thumbnail,
    source: n.source,
    age: n.age,
  }));

  const web: FinanceResult[] = webResults.map((r) => ({
    kind: "web" as const,
    title: r.title,
    url: r.url,
    description: r.description,
    thumbnail: r.thumbnail,
    source: hostOf(r.url),
    age: r.age,
  }));

  // Interleave news ahead of general web context — it's usually more timely.
  return [...news, ...web];
}
