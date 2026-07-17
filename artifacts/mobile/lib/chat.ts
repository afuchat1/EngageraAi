import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { getDeviceLocation } from '@/lib/timezone-location';

// Resolved once at module load — synchronous, zero network, no permissions.
const _deviceLoc = getDeviceLocation();
const DEVICE_LOCATION =
  _deviceLoc.city && _deviceLoc.country
    ? `${_deviceLoc.city}, ${_deviceLoc.country}`
    : _deviceLoc.city || undefined;

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
  userLocation?: string;
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

export interface TimeInfo {
  ianaZone: string;
  label: string;
}

export interface WeatherInfo {
  label: string;
  tempC: number;
  feelsLikeC: number;
  condition: string;
  icon: string;
  windKph: number;
  humidity: number;
  isDay: boolean;
}

export interface StreamDoneEvent {
  model: string;
  conversationId?: number;
  searchInfo?: SearchInfo;
  timeInfo?: TimeInfo;
  weatherInfo?: WeatherInfo;
  guestMessageCount?: number;
  guestMessageLimit?: number;
}

export interface StreamHandlers {
  onToken?: (content: string) => void;
  onMeta?: (searchInfo: SearchInfo) => void;
  onSearchStatus?: (message: string) => void;
  onDone?: (done: StreamDoneEvent) => void;
}

/**
 * Returns true if the prompt looks like a COMPLETE image generation request
 * (has a real subject after the trigger verb) so the UI can show the
 * ImageGenIndicator instead of the normal typing dots.
 *
 * Incomplete prompts like "generate an image of" (nothing after) return false
 * so the normal text response path is shown (the backend will ask the user to
 * describe what they want generated).
 */
export function looksLikeImageRequest(text: string): boolean {
  const t = text.trim();
  if (t.length < 10) return false;

  // Incomplete-prompt guard: just the trigger with nothing after it
  const INCOMPLETE = [
    /^(generate|create|make|produce)\s+(a|an|the)?\s*(image|picture|photo|drawing|painting|illustration|artwork)\s*(of\s*)?[.!?]*$/i,
    /^(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a|an|the|something)?\s*[.!?]*$/i,
    /^(show\s+me\s+)?(a|an)\s*(image|picture|photo)\s*(of\s*)?[.!?]*$/i,
    /^(generate|create|make)\s+an?\s*(image|picture|photo|illustration|artwork)\s*[.!?]*$/i,
  ];
  if (INCOMPLETE.some((p) => p.test(t))) return false;

  // Complete-prompt patterns (real subject present)
  const COMPLETE = [
    // "generate/create/make an image OF something" — most natural phrasing
    /\b(generate|create|make|produce|build)\s+(a\s+|an\s+|the\s+|me\s+a\s+|me\s+an\s+)?(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic|portrait|scene|render)\s+(of|showing|depicting|featuring|about)\s+\w{3,}/i,
    // "generate + ... + image-noun" with 3+ chars between
    /\b(generate|create|make|produce|build)\b.{3,}\b(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic|portrait|scene|render|design)\b/i,
    // "draw/paint/sketch/illustrate/render me/a/an + ≥1 real word"
    /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a\s+|an\s+|the\s+|my\s+)?\w{3,}/i,
    /\bshow\s+me\s+(a|an|the)\s+(picture|image|photo|drawing|illustration)\s+of\s+\w{3,}/i,
    /\b(i\s+)?(want|need|would\s+like|give\s+me)\s+(a|an)\s+(image|picture|photo|drawing|illustration)\s+of\s+\w{3,}/i,
    /\b(design|create|make|generate)\s+(a|an|the)\s+(logo|poster|banner|thumbnail|wallpaper)\s+(for|of|about|showing|with)\s+\w{3,}/i,
    // "image of a X" as standalone phrase
    /\b(image|picture|photo|illustration|artwork)\s+of\s+(a\s+|an\s+|the\s+)?\w{3,}/i,
  ];
  return COMPLETE.some((p) => p.test(t));
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
    let res: Response;
    try {
      res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers,
        // stream: false → server returns a single application/json body.
        // The edge function doesn't do real token streaming (it buffers the
        // full LLM response then sends one SSE event anyway), so there is no
        // UX difference. JSON is far more reliable in React Native because
        // response.body.getReader() is unreliable on Android/Expo Go.
        body: JSON.stringify({ ...request, stream: false, userLocation: request.userLocation ?? DEVICE_LOCATION }),
        signal: controller.signal,
      });
    } catch (networkErr) {
      if (networkErr instanceof Error && networkErr.name === 'AbortError') throw networkErr;
      const detail = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new ChatRequestError(`Could not reach the server (${detail}). Check your connection and try again.`, 0, {
        error: 'network',
        detail,
      });
    }

    // Only treat non-2xx as an error. Do NOT gate on res.body — in some
    // React Native / Expo Go fetch implementations body is null even for
    // perfectly valid JSON responses, which previously caused every
    // successful 200 to be misread as a failure.
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText || `HTTP ${res.status}` }));
      throw new ChatRequestError(err.error ?? `Chat request failed (HTTP ${res.status}).`, res.status, err);
    }

    // With stream: false the server always returns application/json.
    // We also handle the case where res.body is null (some RN builds) by
    // routing through res.json() regardless of content-type in that case.
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json') || !res.body) {
      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        throw new ChatRequestError(
          'The server sent back an incomplete response. Please try again.',
          502,
          { error: 'invalid_json' },
        );
      }

      const content: string =
        typeof (data as any)?.message?.content === 'string' ? (data as any).message.content : '';

      // Guard: empty content means the AI returned nothing — surface it as
      // an error so the user sees actionable text instead of a blank bubble.
      if (!content) {
        throw new ChatRequestError(
          'The AI returned an empty response. Please try again.',
          502,
          { error: 'empty_response' },
        );
      }

      handlers.onToken?.(content);

      // Fire onMeta for search results so callers don't need separate
      // handling for streaming vs JSON response paths.
      const si = (data as any)?.searchInfo as SearchInfo | undefined;
      if (si && Array.isArray(si.sources) && si.sources.length > 0) handlers.onMeta?.(si);

      handlers.onDone?.({
        model: (data as any)?.model,
        conversationId: (data as any)?.conversationId,
        searchInfo: si,
        // timeInfo and weatherInfo were missing from the JSON handler —
        // the server includes them but they were never forwarded to the UI.
        timeInfo: (data as any)?.timeInfo as TimeInfo | undefined,
        weatherInfo: (data as any)?.weatherInfo as WeatherInfo | undefined,
        guestMessageCount: (data as any)?.guestMessageCount,
        guestMessageLimit: (data as any)?.guestMessageLimit,
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
        else if (evt.type === 'searchStatus' && (evt as any).message) handlers.onSearchStatus?.((evt as any).message);
        else if (evt.type === 'error') {
          throw new ChatRequestError(evt.error ?? 'The AI could not process that message. Please try again.', 502, {
            error: evt.error ?? 'stream_error',
          });
        } else if (evt.type === 'done') handlers.onDone?.(evt as StreamDoneEvent);
      }
    }

    if (!sawDone) {
      throw new ChatRequestError(
        'The connection to the server dropped before the reply finished. Please try again.',
        502,
        { error: 'stream_incomplete' },
      );
    }
  } catch (err: unknown) {
    if (err instanceof ChatRequestError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ChatRequestError('Request timed out. Please try again.', 408, { error: 'timeout' });
    }
    // Anything else (e.g. a reader/network failure mid-stream) is still an
    // unknown failure mode, but we surface its actual message instead of a
    // blanket "something went wrong" so the user has something actionable.
    const detail = err instanceof Error && err.message ? err.message : 'unknown error';
    throw new ChatRequestError(`Connection problem (${detail}). Please try again.`, 0, { error: detail });
  } finally {
    clearTimeout(timeoutId);
  }
}

export const CHAT_MODEL = 'engagera-2.0';
export const LAB_MODEL = 'engagera-2.1';
export const GUEST_MESSAGE_LIMIT = 5;
