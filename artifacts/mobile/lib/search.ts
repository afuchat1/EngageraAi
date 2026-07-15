/**
 * Search lib — proxied through the Engagera api-server.
 *
 * The api-server does all HTTP calls server-side (no bot-detection, no CORS),
 * sourcing results from Bing RSS, Google News RSS, and DuckDuckGo autocomplete.
 * No API keys required — this is own infrastructure.
 */

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/search`;

async function req<T>(path: string, query: string): Promise<T> {
  const url = `${BASE}/${path}?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Search ${path} failed (${res.status})`);
  return res.json();
}

// ── Suggestions ────────────────────────────────────────────────────────────────

export async function fetchSuggestions(query: string): Promise<string[]> {
  if (!query.trim() || query.length < 2) return [];
  try {
    const data = await req<{ suggestions: string[] }>('suggestions', query);
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

// ── Web ────────────────────────────────────────────────────────────────────────

export interface WebResult {
  title: string;
  url: string;
  description: string;
  age: string | null;
  favicon: string;
  thumbnail: string | null;
}

export interface WebSearchResponse {
  results: WebResult[];
  /** Kept for API compatibility — not used in server-proxied mode. */
  vqd: string;
}

export async function fetchWebResults(query: string): Promise<WebSearchResponse> {
  const data = await req<{ results: WebResult[] }>('web', query);
  return { results: data.results ?? [], vqd: '' };
}

// ── Images ─────────────────────────────────────────────────────────────────────

export interface ImageResult {
  title: string;
  pageUrl: string;
  src: string;
  thumbnail: string;
  width?: number;
  height?: number;
  source: string;
}

export async function fetchImageResults(query: string, _vqd: string): Promise<ImageResult[]> {
  const data = await req<{ results: ImageResult[] }>('images', query);
  return data.results ?? [];
}

// ── Videos ─────────────────────────────────────────────────────────────────────

export interface VideoResult {
  title: string;
  url: string;
  thumbnail: string;
  duration: string | null;
  publisher: string;
  age: string | null;
  description: string;
}

export async function fetchVideoResults(query: string, _vqd: string): Promise<VideoResult[]> {
  const data = await req<{ results: VideoResult[] }>('videos', query);
  return data.results ?? [];
}

// ── News ───────────────────────────────────────────────────────────────────────

export interface NewsResult {
  title: string;
  url: string;
  description: string;
  thumbnail: string | null;
  source: string;
  age: string | null;
}

export async function fetchNewsResults(query: string, _vqd: string): Promise<NewsResult[]> {
  const data = await req<{ results: NewsResult[] }>('news', query);
  return data.results ?? [];
}

// ── Finance ────────────────────────────────────────────────────────────────────

export interface FinanceResult {
  kind: 'web' | 'news';
  title: string;
  url: string;
  description: string;
  thumbnail?: string | null;
  source: string;
  age: string | null;
}

export async function fetchFinanceResults(query: string): Promise<FinanceResult[]> {
  const data = await req<{ results: FinanceResult[] }>('finance', query);
  return data.results ?? [];
}
