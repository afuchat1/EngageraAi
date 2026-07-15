/**
 * Search proxy — own infrastructure, zero API keys.
 *
 * All searches run server-side (no bot-detection issues) using:
 *   Suggestions → DuckDuckGo autocomplete
 *   Web / Images / Videos / Finance → Bing RSS
 *   News → Google News RSS + Bing News RSS
 */
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const UA =
  "Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0";
const HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9",
};

// ── RSS parser ──────────────────────────────────────────────────────────────

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  thumbnail: string | null;
  source: string | null;
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];

    const text = (tag: string) => {
      const re = new RegExp(
        `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
        "i",
      );
      return block.match(re)?.[1]?.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim() ?? "";
    };

    const attr = (tag: string, attrName: string) => {
      const re = new RegExp(`<${tag}[^>]*\\s${attrName}="([^"]*)"`, "i");
      return block.match(re)?.[1]?.trim() ?? null;
    };

    const title = text("title");
    // RSS <link> is often a bare URL between tags (no attributes)
    const linkMatch = block.match(/<link>([^<]+)<\/link>/i);
    const link = linkMatch?.[1]?.trim() ?? "";
    const description = text("description");
    const pubDate = text("pubDate") || null;
    const thumbnail =
      attr("media:thumbnail", "url") ??
      attr("media:content", "url") ??
      null;
    const source =
      (attr("source", "url") ?? text("source")) || null;

    if (title && link) {
      items.push({ title, link, description, pubDate, thumbnail, source });
    }
  }
  return items;
}

async function bingRSS(query: string): Promise<RSSItem[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: "application/rss+xml, text/xml, */*" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  return parseRSS(await res.text());
}

async function googleNewsRSS(query: string): Promise<RSSItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: "application/rss+xml, text/xml, */*" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const items = parseRSS(xml);
  // Google News encodes the publisher in the `<source>` element
  return items.map((it) => ({
    ...it,
    source: it.source ?? extractGNewsSource(it.description),
  }));
}

async function bingNewsRSS(query: string): Promise<RSSItem[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: "application/rss+xml, text/xml, */*" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  return parseRSS(await res.text());
}

/** Google News descriptions look like: <a href="...">Title</a>  <font ...>Source</font> */
function extractGNewsSource(html: string): string | null {
  const m = html.match(/<font[^>]*>([^<]+)<\/font>/i);
  return m?.[1]?.trim() ?? null;
}

function hostFavicon(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://icons.duckduckgo.com/ip2/${host}.ico`;
  } catch {
    return "";
  }
}

function relativeTime(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
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

// ── Routes ──────────────────────────────────────────────────────────────────

// GET /api/search/suggestions?q=...
router.get("/search/suggestions", async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q || q.length < 2) return res.json({ suggestions: [] });

  try {
    const r = await fetch(
      `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`,
      {
        headers: { ...HEADERS, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      },
    );
    const data = await r.json() as unknown[];
    const arr = data[1];
    return res.json({ suggestions: Array.isArray(arr) ? (arr as string[]).slice(0, 8) : [] });
  } catch {
    return res.json({ suggestions: [] });
  }
});

// GET /api/search/web?q=...
router.get("/search/web", async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) return res.json({ results: [] });

  try {
    const items = await bingRSS(q);
    const results = items.map((it) => ({
      title: it.title,
      url: it.link,
      description: it.description,
      age: relativeTime(it.pubDate),
      favicon: hostFavicon(it.link),
      thumbnail: it.thumbnail,
    }));
    return res.json({ results });
  } catch {
    return res.json({ results: [] });
  }
});

// GET /api/search/images?q=...
// Uses Bing web RSS with "{q} images photos" to surface image gallery pages.
router.get("/search/images", async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) return res.json({ results: [] });

  try {
    const items = await bingRSS(`${q} images photos`);
    const results = items.map((it) => ({
      title: it.title,
      pageUrl: it.link,
      src: it.thumbnail ?? "",
      thumbnail: it.thumbnail ?? "",
      source: (() => { try { return new URL(it.link).hostname; } catch { return ""; } })(),
    })).filter((r) => r.pageUrl);
    return res.json({ results });
  } catch {
    return res.json({ results: [] });
  }
});

// GET /api/search/videos?q=...
// Uses Bing web RSS with "{q} video watch" to surface video pages.
router.get("/search/videos", async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) return res.json({ results: [] });

  try {
    const items = await bingRSS(`${q} video watch`);
    const results = items.map((it) => ({
      title: it.title,
      url: it.link,
      thumbnail: it.thumbnail ?? "",
      duration: null,
      publisher: (() => { try { return new URL(it.link).hostname; } catch { return ""; } })(),
      age: relativeTime(it.pubDate),
      description: it.description,
    }));
    return res.json({ results });
  } catch {
    return res.json({ results: [] });
  }
});

// GET /api/search/news?q=...
router.get("/search/news", async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) return res.json({ results: [] });

  try {
    const [gNews, bNews] = await Promise.allSettled([
      googleNewsRSS(q),
      bingNewsRSS(q),
    ]);
    const gItems = gNews.status === "fulfilled" ? gNews.value : [];
    const bItems = bNews.status === "fulfilled" ? bNews.value : [];

    // Merge and deduplicate by title prefix
    const seen = new Set<string>();
    const merged = [...gItems, ...bItems].filter((it) => {
      const key = it.title.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const results = merged.map((it) => ({
      title: it.title,
      url: it.link,
      description: it.description.replace(/<[^>]*>/g, "").trim(),
      thumbnail: it.thumbnail,
      source: it.source ?? (() => { try { return new URL(it.link).hostname; } catch { return ""; } })(),
      age: relativeTime(it.pubDate),
    }));
    return res.json({ results });
  } catch {
    return res.json({ results: [] });
  }
});

// GET /api/search/finance?q=...
router.get("/search/finance", async (req: Request, res: Response) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) return res.json({ results: [] });

  const finQ = `${q} stock market finance`;

  try {
    const [web, gNews, bNews] = await Promise.allSettled([
      bingRSS(finQ),
      googleNewsRSS(finQ),
      bingNewsRSS(finQ),
    ]);

    const webItems = (web.status === "fulfilled" ? web.value : []).map((it) => ({
      kind: "web" as const,
      title: it.title,
      url: it.link,
      description: it.description,
      thumbnail: it.thumbnail ?? null,
      source: (() => { try { return new URL(it.link).hostname; } catch { return ""; } })(),
      age: relativeTime(it.pubDate),
    }));

    const gItems = (gNews.status === "fulfilled" ? gNews.value : []);
    const bItems = (bNews.status === "fulfilled" ? bNews.value : []);
    const seen = new Set<string>();
    const newsItems = [...gItems, ...bItems]
      .filter((it) => {
        const key = it.title.slice(0, 40).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((it) => ({
        kind: "news" as const,
        title: it.title,
        url: it.link,
        description: it.description.replace(/<[^>]*>/g, "").trim(),
        thumbnail: it.thumbnail ?? null,
        source: it.source ?? (() => { try { return new URL(it.link).hostname; } catch { return ""; } })(),
        age: relativeTime(it.pubDate),
      }));

    return res.json({ results: [...webItems, ...newsItems] });
  } catch {
    return res.json({ results: [] });
  }
});

export default router;
