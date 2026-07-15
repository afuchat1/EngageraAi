/**
 * Search lib — powered by DuckDuckGo.
 *
 * No API key, no backend. Called directly from React Native, which makes
 * native OS HTTP requests (no browser CORS restrictions). DuckDuckGo is
 * the same search infrastructure already used by the Supabase chat function.
 *
 * Flow:
 *   1. fetchWebResults(q)  → returns results + vqd token
 *   2. use vqd for fetchImageResults / fetchVideoResults / fetchNewsResults
 *   3. fetchFinanceResults is self-contained (its own web fetch + news)
 */

const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

function h(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'User-Agent': UA,
    'Accept-Language': 'en-US,en;q=0.9',
    ...extra,
  };
}

// ── Suggestions ────────────────────────────────────────────────────────────────

export async function fetchSuggestions(query: string): Promise<string[]> {
  if (!query.trim() || query.length < 2) return [];
  try {
    const res = await fetch(
      `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`,
      { headers: h({ Accept: 'application/json' }) },
    );
    const data = await res.json();
    // Response shape: ["query", ["sug1","sug2",...]]
    const arr: unknown = data[1];
    return Array.isArray(arr) ? (arr as string[]).slice(0, 8) : [];
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
  /** DuckDuckGo session token — pass to image/video/news fetchers. */
  vqd: string;
}

export async function fetchWebResults(query: string): Promise<WebSearchResponse> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: h({
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://duckduckgo.com/',
      }),
    },
  );
  const html = await res.text();

  // Extract vqd token (needed for image/video/news APIs)
  const vqdMatch = html.match(/vqd=['"]([^'"]{5,80})['"]/);
  const vqd = vqdMatch?.[1] ?? '';

  // Parse result links
  const titleRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const titles: { url: string; title: string }[] = [];
  const snippets: string[] = [];

  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html)) !== null && titles.length < 10) {
    let url = m[1];
    if (url.includes('uddg=')) {
      try {
        url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
      } catch { /**/ }
    }
    const title = m[2].replace(/<[^>]*>/g, '').trim();
    if (title && url.startsWith('http')) titles.push({ url, title });
  }

  let s: RegExpExecArray | null;
  while ((s = snippetRe.exec(html)) !== null && snippets.length < 10) {
    snippets.push(s[1].replace(/<[^>]*>/g, '').trim());
  }

  const results: WebResult[] = [];
  for (let i = 0; i < Math.min(titles.length, snippets.length); i++) {
    if (!titles[i]?.title || !snippets[i]) continue;
    let host = '';
    try { host = new URL(titles[i].url).hostname; } catch { /**/ }
    results.push({
      title: titles[i].title,
      url: titles[i].url,
      description: snippets[i],
      age: null,
      favicon: `https://icons.duckduckgo.com/ip2/${host}.ico`,
      thumbnail: null,
    });
  }

  return { results, vqd };
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

export async function fetchImageResults(query: string, vqd: string): Promise<ImageResult[]> {
  if (!vqd) return [];
  const url =
    `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&p=1&o=json&l=us-en` +
    `&vqd=${encodeURIComponent(vqd)}&f=,,,,,&s=0`;
  const res = await fetch(url, {
    headers: h({ Accept: 'application/json', Referer: 'https://duckduckgo.com/' }),
  });
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data?.results ?? []).map((r: any) => ({
    title: r.title ?? '',
    pageUrl: r.url ?? '',
    src: r.image ?? '',
    thumbnail: r.thumbnail ?? r.image ?? '',
    width: r.width,
    height: r.height,
    source: r.source ?? '',
  })).filter((r: ImageResult) => r.thumbnail);
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

export async function fetchVideoResults(query: string, vqd: string): Promise<VideoResult[]> {
  if (!vqd) return [];
  const url =
    `https://duckduckgo.com/v.js?q=${encodeURIComponent(query)}&p=1&o=json&l=us-en` +
    `&vqd=${encodeURIComponent(vqd)}&f=,,,,,&s=0`;
  const res = await fetch(url, {
    headers: h({ Accept: 'application/json', Referer: 'https://duckduckgo.com/' }),
  });
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data?.results ?? []).map((r: any) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    thumbnail: r.images?.large ?? r.images?.medium ?? r.images?.small ?? '',
    duration: r.duration ?? null,
    publisher: r.publisher ?? '',
    age: r.published ?? null,
    description: r.description ?? '',
  })).filter((r: VideoResult) => r.url);
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

export async function fetchNewsResults(query: string, vqd: string): Promise<NewsResult[]> {
  if (!vqd) return [];
  const url =
    `https://duckduckgo.com/news.js?q=${encodeURIComponent(query)}&p=1&o=json&l=us-en` +
    `&vqd=${encodeURIComponent(vqd)}&noamp=1`;
  const res = await fetch(url, {
    headers: h({ Accept: 'application/json', Referer: 'https://duckduckgo.com/' }),
  });
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data?.results ?? []).map((r: any) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    description: r.excerpt ?? '',
    thumbnail: r.image ?? null,
    source: r.source ?? '',
    age: r.relative_time ?? null,
  })).filter((r: NewsResult) => r.url);
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

/** Self-contained: does its own web search for finance context + news. */
export async function fetchFinanceResults(query: string): Promise<FinanceResult[]> {
  try {
    const finQ = `${query} stock market finance`;
    const webRes = await fetchWebResults(finQ);
    const [news] = await Promise.allSettled([fetchNewsResults(finQ, webRes.vqd)]);

    const webItems: FinanceResult[] = webRes.results.map((r) => ({
      kind: 'web',
      title: r.title,
      url: r.url,
      description: r.description,
      source: '',
      age: r.age,
    }));

    const newsItems: FinanceResult[] =
      news.status === 'fulfilled'
        ? news.value.map((r) => ({
            kind: 'news',
            title: r.title,
            url: r.url,
            description: r.description,
            thumbnail: r.thumbnail,
            source: r.source,
            age: r.age,
          }))
        : [];

    return [...webItems, ...newsItems];
  } catch {
    return [];
  }
}
