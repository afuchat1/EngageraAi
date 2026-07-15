/**
 * AfuBot — Engagera's own web crawler and spider.
 *
 * Given a query, AfuBot decides which real sites are worth visiting (from
 * its seed directory), fetches their HTML directly, follows a hop of
 * relevant links, and scores/ranks the pages itself. There is no call to
 * Bing, Google, Brave, or DuckDuckGo anywhere in this file — every result
 * comes from a page AfuBot actually fetched and read.
 */
import { SEEDS, UNIVERSAL_SEED_NAMES, type Seed } from "./seeds";
import {
  extractTitle,
  extractMeta,
  extractLinks,
  extractImages,
  extractVideoEmbed,
  stripTags,
  faviconFor,
  hostOf,
  type ExtractedLink,
} from "./html";

const AFUBOT_UA = "AfuBot/1.0 (+Engagera web crawler; contact: support@engagera.ai)";
const FETCH_TIMEOUT_MS = 6000;
const HOP2_LIMIT = 14;

export interface CrawledPage {
  url: string;
  host: string;
  title: string;
  description: string;
  text: string;
  ogImage: string | null;
  images: { src: string; alt: string }[];
  video: ReturnType<typeof extractVideoEmbed>;
  score: number;
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": AFUBOT_UA, "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/html|xml/i.test(ct) && ct !== "") return null;
    return await res.text();
  } catch {
    return null;
  }
}

function scorePage(page: { title: string; description: string; text: string }, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const title = page.title.toLowerCase();
  const desc = page.description.toLowerCase();
  const text = page.text.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (title.includes(t)) score += 5;
    if (desc.includes(t)) score += 3;
    // Cap per-token body contribution so long pages don't dominate purely on length.
    const bodyHits = text.split(t).length - 1;
    score += Math.min(bodyHits, 4);
  }
  return score;
}

function scoreSeed(seed: Seed, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  let score = 0;
  const haystack = [seed.name.toLowerCase(), seed.category, ...seed.keywords];
  for (const t of tokens) {
    for (const h of haystack) {
      if (h.includes(t) || t.includes(h)) score += 1;
    }
  }
  return score;
}

async function crawlOne(url: string): Promise<CrawledPage | null> {
  const html = await fetchHtml(url);
  if (!html) return null;
  const title = extractMeta(html, "og:title") || extractTitle(html);
  const description = extractMeta(html, "og:description") || extractMeta(html, "description") || "";
  const text = stripTags(html).slice(0, 4000);
  const ogImage = extractMeta(html, "og:image");
  const images = extractImages(html, url, 12);
  const video = extractVideoEmbed(html);
  return {
    url,
    host: hostOf(url),
    title: title || hostOf(url),
    description,
    text,
    ogImage,
    images,
    video,
    score: 0,
  };
}

function pickRelevantLinks(links: ExtractedLink[], sameHost: string, tokens: string[], limit: number): string[] {
  const scored = links
    .filter((l) => hostOf(l.href) === sameHost)
    .map((l) => ({ href: l.href, s: scorePage({ title: l.text, description: "", text: "" }, tokens) }))
    .filter((l) => l.s > 0)
    .sort((a, b) => b.s - a.s);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of scored) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    out.push(l.href);
    if (out.length >= limit) break;
  }
  return out;
}

const crawlCache = new Map<string, { at: number; pages: CrawledPage[] }>();
const CACHE_TTL_MS = 60_000;

/**
 * Runs a full AfuBot crawl for a query: picks seeds, fetches their
 * homepages, follows the most relevant links one hop deep, and returns
 * every page it visited, scored against the query.
 */
export async function crawl(query: string): Promise<CrawledPage[]> {
  const key = query.trim().toLowerCase();
  const cached = crawlCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.pages;

  const tokens = tokenize(query);

  // 1. Pick which seeds AfuBot should visit for this query: topical keyword
  // matches, plus the universal reference seeds (Wikipedia etc.) every time
  // so AfuBot can answer virtually any query, not just ones its curated
  // keyword lists happen to recognize.
  const byScore = SEEDS
    .map((s) => ({ seed: s, score: scoreSeed(s, tokens) }))
    .sort((a, b) => b.score - a.score);
  const topical = byScore.filter((c) => c.score > 0).slice(0, 6);
  const chosenNames = new Set(topical.map((c) => c.seed.name));
  const universal = SEEDS.filter((s) => UNIVERSAL_SEED_NAMES.includes(s.name) && !chosenNames.has(s.name));
  const candidateSeeds = [...topical.map((c) => c.seed), ...universal];

  // 2. Fetch each seed's own on-site search results for the query (falling
  // back to its homepage if it has no search feature). This is still
  // AfuBot reading one real site directly — never a third-party search API.
  const seedPages = await Promise.all(
    candidateSeeds.map(async (seed) => {
      const fetchUrl = seed.search ? seed.search(query) : seed.url;
      const html = await fetchHtml(fetchUrl);
      if (!html) return null;
      // A search-results page itself isn't a useful standalone result for
      // "searchOnly" sites (it's just a listing) — only keep it as a page
      // AfuBot can hop out from, not as a rankable result.
      const page = seed.searchOnly ? null : await crawlOne(fetchUrl);
      return { page, html, seed, fetchUrl };
    }),
  );

  const validSeedPages = seedPages.filter(
    (p): p is { page: CrawledPage | null; html: string; seed: Seed; fetchUrl: string } => p !== null,
  );

  // 3. From each seed's search/homepage page, follow the links most relevant
  // to the query (one hop) — this is where the actual matched content lives.
  const hop2Targets = new Set<string>();
  for (const { html, fetchUrl } of validSeedPages) {
    const actualHost = hostOf(fetchUrl);
    const links = extractLinks(html, fetchUrl, 250);
    for (const href of pickRelevantLinks(links, actualHost, tokens, 4)) {
      if (hop2Targets.size < HOP2_LIMIT) hop2Targets.add(href);
    }
  }

  const hop2Pages = await Promise.all(Array.from(hop2Targets).map((url) => crawlOne(url)));

  // 3b. A single bare word (no spaces/dots) that isn't a widely-known topic
  // won't turn up on Wikipedia or news search results, but it may well be
  // someone's actual site — the same way a browser address bar guesses
  // ".com" for a plain word. AfuBot fetches that guess directly and only
  // keeps it if the site is real (a genuine crawl, not a fabricated link).
  let domainGuessPage: CrawledPage | null = null;
  const bareWord = query.trim();
  if (/^[a-z0-9-]{2,}$/i.test(bareWord)) {
    domainGuessPage = await crawlOne(`https://${bareWord.toLowerCase()}.com`);
  }

  const allPages = [
    ...validSeedPages.map((p) => p.page).filter((p): p is CrawledPage => p !== null),
    ...hop2Pages.filter((p): p is CrawledPage => p !== null),
    ...(domainGuessPage ? [domainGuessPage] : []),
  ];

  // 4. Score every page AfuBot actually visited against the query.
  const scored = allPages.map((p) => {
    const score = scorePage(p, tokens);
    // A guessed-domain page that actually resolved is a very strong signal
    // for a bare single-word query — rank it above generic reference hits.
    const isDomainGuess = domainGuessPage && p.url === domainGuessPage.url;
    return { ...p, score: isDomainGuess ? score + 50 : score };
  });

  crawlCache.set(key, { at: Date.now(), pages: scored });
  // Keep the cache small.
  if (crawlCache.size > 200) {
    const oldestKey = crawlCache.keys().next().value;
    if (oldestKey) crawlCache.delete(oldestKey);
  }
  return scored;
}

export function toWebResults(pages: CrawledPage[], limit = 12) {
  const relevant = pages.filter((p) => p.score > 0);
  // Only fall back to "everything AfuBot visited" (even 0-scored) if nothing matched at all.
  const pool = relevant.length > 0 ? relevant : pages;
  const seenHost = new Map<string, number>();
  return pool
    .sort((a, b) => b.score - a.score)
    .filter((p) => {
      const count = seenHost.get(p.host) ?? 0;
      if (count >= 2) return false;
      seenHost.set(p.host, count + 1);
      return true;
    })
    .slice(0, limit)
    .map((p) => ({
      title: p.title,
      url: p.url,
      description: (p.description || p.text).slice(0, 220),
      age: null as string | null,
      favicon: faviconFor(p.url),
      thumbnail: p.ogImage,
    }));
}

export function toImageResults(pages: CrawledPage[], limit = 24) {
  const out: { title: string; pageUrl: string; src: string; thumbnail: string; source: string }[] = [];
  const seenSrc = new Set<string>();
  const sorted = [...pages].sort((a, b) => b.score - a.score);
  for (const p of sorted) {
    for (const img of p.images) {
      if (seenSrc.has(img.src)) continue;
      seenSrc.add(img.src);
      out.push({
        title: img.alt || p.title,
        pageUrl: p.url,
        src: img.src,
        thumbnail: img.src,
        source: p.host,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function toVideoResults(pages: CrawledPage[], limit = 12) {
  const sorted = [...pages].sort((a, b) => b.score - a.score);
  const out: { title: string; url: string; thumbnail: string; duration: string | null; publisher: string; age: string | null; description: string }[] = [];
  for (const p of sorted) {
    if (!p.video) continue;
    out.push({
      title: p.title,
      url: p.video.watchUrl,
      thumbnail: p.video.thumbnail || p.ogImage || "",
      duration: null,
      publisher: p.host,
      age: null,
      description: p.description.slice(0, 160),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Detects bare-domain input like "afuchat.com" or "engagera.ai/docs" so the app can open it directly. */
export function looksLikeDomain(input: string): string | null {
  const t = input.trim();
  if (!t || /\s/.test(t)) return null;
  const stripped = t.replace(/^https?:\/\//i, "");
  const domainRe = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/[^\s]*)?$/i;
  if (!domainRe.test(stripped)) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
