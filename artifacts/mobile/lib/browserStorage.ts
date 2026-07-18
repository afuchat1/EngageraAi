/**
 * Browser storage helpers — tabs state is in-memory only (per session);
 * history is persisted to AsyncStorage so it survives app restarts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = 'engagera_browser_history';
const MAX_HISTORY  = 500;

export interface HistoryEntry {
  url:       string;
  title:     string;
  visitedAt: number; // unix ms
}

/** Prepend a new visit, dedup by URL, cap at MAX_HISTORY. */
export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const list: HistoryEntry[] = raw ? JSON.parse(raw) : [];
    const deduped = list.filter((e) => e.url !== entry.url);
    const updated = [entry, ...deduped].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch { /* best-effort */ }
}

export async function loadBrowserHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearBrowserHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch { /* best-effort */ }
}

/** Human-readable relative time label (Today / Yesterday / date). */
export function historyDateLabel(ts: number): string {
  const now  = new Date();
  const date = new Date(ts);
  const diffDays = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
     Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) /
    86_400_000,
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format a unix-ms timestamp as a short time string, e.g. "3:45 PM". */
export function historyTimeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
