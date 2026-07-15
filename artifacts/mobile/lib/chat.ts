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

// Mirrors the backend's isImageGenRequest() heuristic in
// supabase/functions/chat/index.ts — used client-side ONLY to decide how to
// render the "in progress" placeholder (a picture-frame loader instead of
// the normal typing dots). The backend remains the single source of truth
// for whether a request is actually routed to image generation.
const IMAGE_GEN_KEYWORDS = [
  'generate an image', 'generate a image', 'generate a picture', 'generate the picture',
  'generate a photo', 'generate the photo', 'generate artwork', 'generate an artwork',
  'generate some art', 'generate an illustration', 'generate a illustration',
  'generate a logo', 'generate the logo', 'generate a wallpaper', 'generate wallpaper',
  'generate a poster', 'generate poster', 'generate a banner', 'generate banner',
  'generate a thumbnail', 'generate thumbnail', 'generate a drawing',
  'create an image', 'create a image', 'create a picture', 'create the picture',
  'create a photo', 'create the photo', 'create artwork', 'create an artwork',
  'create an illustration', 'create a illustration', 'create a logo', 'create the logo',
  'create a wallpaper', 'create wallpaper', 'create a poster', 'create poster',
  'create a banner', 'create banner', 'create a thumbnail', 'create thumbnail',
  'create a drawing',
  'make an image', 'make a image', 'make me an image', 'make me a image',
  'make a picture', 'make me a picture', 'make a photo', 'make me a photo',
  'make artwork', 'make me artwork', 'make me art',
  'make an illustration', 'make a illustration', 'make a logo', 'make me a logo',
  'make a drawing', 'make me a drawing',
  'draw me', 'draw a ', 'draw an ', 'paint a ', 'paint an ', 'paint me',
  'sketch a ', 'sketch an ', 'sketch me',
  'illustrate this', 'illustrate a', 'illustrate me', 'please illustrate',
  'render a ', 'render an ', 'render me',
  'design a logo', 'design the logo', 'design an image', 'design a poster',
  'design the poster', 'design a banner', 'design the banner',
  'design a thumbnail', 'design a wallpaper',
  'show me a picture', 'show me an image', 'show me a photo',
  'show me a drawing', 'show me a painting', 'show me an illustration', 'show me a logo',
];

const IMAGE_GEN_PATTERNS: RegExp[] = [
  /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a\s+|an\s+|the\s+|some\s+|my\s+)?\w/i,
  /\b(generate|create|make|produce)\b.{0,50}\b(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic)\b/i,
  /\b(can|could|please|would you|will you)\s+you\s+(draw|paint|sketch|illustrate|render)\b/i,
  /\b(i want|i need|i'd like|give me)\s+(a\s+|an\s+)(image|picture|photo|drawing|illustration|painting|artwork)\b/i,
];

/** Best-effort client-side guess of whether a message will trigger image generation. */
export function looksLikeImageRequest(text: string): boolean {
  const t = text.toLowerCase();
  return IMAGE_GEN_KEYWORDS.some((k) => t.includes(k)) || IMAGE_GEN_PATTERNS.some((p) => p.test(t));
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

    // Image generation always answers with a single application/json body
    // (never text/event-stream) even when the request asked for stream:
    // true, because the backend has to wait for the whole image before it
    // can reply. Detect that here and synthesize the same token/done
    // events the SSE path would have produced, instead of trying to parse
    // JSON as SSE frames (which previously threw "Stream ended
    // unexpectedly" and surfaced as "Something went wrong").
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      const content: string = typeof data?.message?.content === 'string' ? data.message.content : '';
      if (content) handlers.onToken?.(content);
      handlers.onDone?.({
        model: data?.model,
        conversationId: data?.conversationId,
        searchInfo: data?.searchInfo,
        guestMessageCount: data?.guestMessageCount,
        guestMessageLimit: data?.guestMessageLimit,
      });
      return;
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
