/**
 * Search lib — talks to Engagera's `search` Supabase edge function.
 *
 * The edge function aggregates results from free, keyless sources
 * (DuckDuckGo, Bing News RSS, Google News RSS, curated outlet RSS feeds,
 * Bing image search, YouTube search) server-side, so no API key or
 * dedicated backend is needed here — same pattern as `chat.ts`.
 */
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { getOrCreateGuestSessionId } from '@/lib/chat';

const BASE = `${SUPABASE_URL}/functions/v1/search`;

async function buildHeaders(): Promise<Record<string, string>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
  };
  if (!token) headers['x-guest-session-id'] = await getOrCreateGuestSessionId();
  return headers;
}

async function req<T>(type: string, query: string): Promise<T> {
  const headers = await buildHeaders();
  const url = `${BASE}?type=${type}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Search ${type} failed (${res.status})`);
  return res.json();
}

// ── Domain detection ─────────────────────────────────────────────────────────
// If the input looks like a bare domain (e.g. "afuchat.com"), open it
// directly in the in-app browser instead of running a search.

export async function resolveDomain(query: string): Promise<string | null> {
  if (!query.trim() || /\s/.test(query.trim())) return null;
  try {
    const data = await req<{ domainUrl: string | null }>('resolve', query);
    return data.domainUrl ?? null;
  } catch {
    return null;
  }
}

// ── Suggestions ────────────────────────────────────────────────────────────────

export async function fetchSuggestions(query: string): Promise<string[]> {
  if (!query.trim() || query.length < 2) return [];
  try {
    const data = await req<{ suggestions: string[] }>('suggest', query);
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
