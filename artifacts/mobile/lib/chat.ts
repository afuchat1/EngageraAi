import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  conversationId?: number;
  contextHint?: string;
  stream?: boolean;
}

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  image?: string;
}

export interface SearchInfo {
  query: string;
  sources: SearchSource[];
}

export interface StreamDoneEvent {
  model: string;
  conversationId?: number;
  searchInfo?: SearchInfo;
  guestMessageCount?: number;
  guestMessageLimit?: number;
}

export interface StreamHandlers {
  onToken?: (content: string) => void;
  onMeta?: (searchInfo: SearchInfo) => void;
  onDone?: (done: StreamDoneEvent) => void;
}

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/chat`;
const REQUEST_TIMEOUT_MS = 60_000;
const GUEST_SESSION_KEY = 'engagera_guest_session_id';

function randomId(): string {
  // Do NOT use the 'uuid' package here — it needs crypto.getRandomValues(),
  // which crashes on iOS/Android. This matches the project convention.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

export async function getOrCreateGuestSessionId(): Promise<string> {
  const existing = await AsyncStorage.getItem(GUEST_SESSION_KEY);
  if (existing) return existing;
  const id = randomId();
  await AsyncStorage.setItem(GUEST_SESSION_KEY, id);
  return id;
}

export async function buildAuthHeaders(): Promise<Record<string, string>> {
  return buildHeaders();
}

async function buildHeaders(): Promise<Record<string, string>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
  };

  if (!token) {
    headers['x-guest-session-id'] = await getOrCreateGuestSessionId();
  }

  return headers;
}

export class ChatRequestError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function streamChat(
  request: ChatRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const headers = await buildHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await expoFetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...request, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new ChatRequestError(err.error ?? 'Chat request failed', res.status, err);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIdx: number;
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);

        const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (payload === '[DONE]') {
          sawDone = true;
          continue;
        }

        let evt: { type: string; content?: string; searchInfo?: SearchInfo; error?: string } & Partial<StreamDoneEvent>;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }

        if (evt.type === 'token' && evt.content) handlers.onToken?.(evt.content);
        else if (evt.type === 'meta' && evt.searchInfo) handlers.onMeta?.(evt.searchInfo);
        else if (evt.type === 'error') throw new Error(evt.error ?? 'Stream error');
        else if (evt.type === 'done') handlers.onDone?.(evt as StreamDoneEvent);
      }
    }

    if (!sawDone) {
      throw new Error('Stream ended unexpectedly before completion.');
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ChatRequestError('Request timed out. Please try again.', 408, { error: 'timeout' });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const CHAT_MODEL = 'engagera-2.0';
export const LAB_MODEL = 'engagera-2.1';
export const GUEST_MESSAGE_LIMIT = 5;
