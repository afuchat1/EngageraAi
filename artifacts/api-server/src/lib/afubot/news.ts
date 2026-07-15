/**
 * AfuBot news — reads real news outlets' own official RSS feeds directly
 * (their own published content, not a search aggregator's ranking of it)
 * and ranks headlines itself against the query.
 */
import { NEWS_FEEDS } from "./seeds";
import { stripTags, decodeEntities } from "./html";

const AFUBOT_UA = "AfuBot/1.0 (+Engagera web crawler; contact: support@engagera.ai)";
const FETCH_TIMEOUT_MS = 6000;

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  thumbnail: string | null;
  source: string;
}

function parseFeed(xml: string, source: string): FeedItem[] {
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
    const thumbMatch = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i) ?? block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    if (title && link) {
      items.push({ title, link, description, pubDate, thumbnail: thumbMatch?.[1] ?? null, source });
    }
  }
  return items;
}

async function fetchFeed(feedUrl: string, source: string): Promise<FeedItem[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": AFUBOT_UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), source);
  } catch {
    return [];
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

function score(item: FeedItem, tokens: string[]): number {
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

export async function fetchAfuBotNews(query: string, limit = 15) {
  const tokens = query.trim().toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const feeds = await Promise.all(NEWS_FEEDS.map((f) => fetchFeed(f.url, f.source)));
  const all = feeds.flat();
  const relevant = tokens.length > 0 ? all.filter((it) => score(it, tokens) > 0) : all;
  const pool = relevant.length > 0 ? relevant : all; // fall back to latest headlines if nothing matches

  const seen = new Set<string>();
  return pool
    .sort((a, b) => score(b, tokens) - score(a, tokens))
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
