/**
 * Search lib — talks to Engagera's `search` Supabase edge function.
 *
 * The edge function aggregates results from free, keyless sources
 * (DuckDuckGo, Bing News RSS, Google News RSS, curated outlet RSS feeds,
 * Bing image search, YouTube search) server-side, so no API key or
 * dedicated backend is needed here — same pattern as `chat.ts`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { getOrCreateGuestSessionId, LAB_MODEL } from '@/lib/chat';

const BASE = `${SUPABASE_URL}/functions/v1/search`;
const CHAT_URL = `${SUPABASE_URL}/functions/v1/chat`;

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

// ── Search history ────────────────────────────────────────────────────────────
// Persists the last MAX_HISTORY searches in AsyncStorage, newest first.

const HISTORY_KEY = 'AFUBOT_SEARCH_HISTORY_V1';
const MAX_HISTORY = 50;

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
}

export async function loadSearchHistory(): Promise<SearchHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SearchHistoryItem[];
  } catch {
    return [];
  }
}

export async function saveToHistory(query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  try {
    const existing = await loadSearchHistory();
    // Dedupe: remove older entry for the same query (case-insensitive)
    const deduped = existing.filter((h) => h.query.toLowerCase() !== q.toLowerCase());
    const updated = [{ query: q, timestamp: Date.now() }, ...deduped].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch { /* non-fatal */ }
}

export async function clearSearchHistory(): Promise<void> {
  try { await AsyncStorage.removeItem(HISTORY_KEY); } catch { /* non-fatal */ }
}

export async function removeFromHistory(query: string): Promise<void> {
  try {
    const existing = await loadSearchHistory();
    const updated = existing.filter((h) => h.query.toLowerCase() !== query.toLowerCase());
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch { /* non-fatal */ }
}

// ── Smart domain suggestion (omnibox-style) ───────────────────────────────────
// When the user types a single word with no spaces or dots, suggest visiting
// <word>.com — same pattern as Chrome/Safari's address bar. No network call
// needed here; we just surface the chip and let the in-app browser handle it.

export function getPotentialDomain(input: string): string | null {
  const t = input.trim().toLowerCase();
  // Must be a single token: no spaces, no dots, no slashes, no @ signs
  if (!t || t.length < 2 || t.length > 63) return null;
  if (/[\s./\\@?#%]/.test(t)) return null;
  // Only allow label-valid characters (letters, digits, hyphens)
  if (!/^[a-z0-9-]+$/.test(t)) return null;
  return `${t}.com`;
}

// ── Official-site probe ───────────────────────────────────────────────────────
// For single-word queries (e.g. "afuchat"), asks the edge function to probe
// common TLDs (afuchat.com, afuchat.io, …) and return the first live URL.
// The result is pinned as an "Official site" card at the top of web results —
// the same behaviour as Google's knowledge panel for brand queries.

export async function probeOfficialSite(word: string): Promise<string | null> {
  const t = word.trim();
  if (!t || /[\s./]/.test(t)) return null;
  try {
    const data = await req<{ url: string | null }>('probe', t);
    return data.url ?? null;
  } catch {
    return null;
  }
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

// ── Engagera AI overview ─────────────────────────────────────────────────────
// A search-results-page AI summary, generated on demand (only when the user
// opens the "AI" tab) by calling the same `chat` edge function the Chat tab
// uses, so it counts against the same guest-message quota rather than being
// fired silently on every search.

export interface AiOverviewSource {
  title: string;
  url: string;
  source: string;
}

export interface AiOverviewResult {
  answer: string;
  sources: AiOverviewSource[];
}

const AI_OVERVIEW_CONTEXT_HINT = [
  'You are generating the "Engagera AI" overview shown at the top of a search-results page for the',
  "user's query below — not a normal chat reply. Answer it directly in 2-5 sentences of plain prose",
  '(no markdown headers; a short list is fine only if the query is itself asking for a list).',
  'Be concise and confident. If the query concerns something time-sensitive that you cannot verify',
  "live, say so briefly instead of guessing.",
].join(' ');

export async function fetchAiOverview(query: string): Promise<AiOverviewResult> {
  const headers = await buildHeaders();
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages: [{ role: 'user', content: query }],
      model: LAB_MODEL,
      stream: false,
      contextHint: AI_OVERVIEW_CONTEXT_HINT,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err?.error ?? `AI overview failed (${res.status})`);
  }
  const data = await res.json();
  const answer: string = typeof data?.message?.content === 'string' ? data.message.content : '';
  const rawSources: { title?: string; url?: string }[] = data?.searchInfo?.sources ?? [];
  const sources: AiOverviewSource[] = rawSources
    .filter((s) => typeof s.url === 'string' && s.url)
    .map((s) => {
      let host = '';
      try { host = new URL(s.url as string).hostname; } catch { /**/ }
      return { title: s.title ?? host, url: s.url as string, source: host };
    });
  return { answer, sources };
}
