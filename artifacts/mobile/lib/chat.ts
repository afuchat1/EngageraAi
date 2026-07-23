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
  useAfuBot?: boolean;
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
  crawledUrls?: string[];
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
  crawledUrls?: string[];
  crawledSources?: SearchSource[];
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
    // "generate/create/make an image OF something" — most natural phrasing.
    // Optional article (a/an/the) before the subject handles "of a lion" etc.
    /\b(generate|create|make|produce|build)\s+(a\s+|an\s+|the\s+|me\s+a\s+|me\s+an\s+)?(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic|portrait|scene|render)\s+(of|showing|depicting|featuring|about)\s+(a\s+|an\s+|the\s+)?\w{3,}/i,
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

/**
 * Stream a chat request using XMLHttpRequest.
 *
 * XHR's onreadystatechange fires at readyState=3 (LOADING) as data arrives,
 * giving us incremental SSE frames on Android and iOS alike — including inside
 * Expo Go. The standard fetch API's response.body.getReader() is unreliable
 * on Android (the body is often null or the stream stalls), so XHR is the
 * correct primitive for SSE in React Native.
 *
 * Flow:
 *   stream:true  → server returns text/event-stream  → live status + tokens
 *   image gen    → server returns application/json   → handled at DONE
 */
export function streamChat(
  request: ChatRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return buildHeaders().then(
    (headers) =>
      new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', EDGE_FUNCTION_URL);
        for (const [k, v] of Object.entries(headers)) {
          xhr.setRequestHeader(k, v);
        }
        xhr.timeout = REQUEST_TIMEOUT_MS;

        let offset = 0;      // bytes of responseText already consumed
        let buffer = '';     // incomplete SSE frame accumulator
        let settled = false; // guard against double-resolve/reject

        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          fn();
        };

        /** Parse all complete \n\n-delimited SSE frames in `buffer`. */
        const flush = () => {
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? ''; // trailing incomplete chunk
          for (const part of parts) {
            const line = part.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            const raw = line.slice(5).trim();
            if (raw === '[DONE]') continue;
            try {
              const evt = JSON.parse(raw) as Record<string, unknown>;
              if (evt.type === 'token' && evt.content)
                handlers.onToken?.(evt.content as string);
              else if (evt.type === 'searchStatus' && evt.message)
                handlers.onSearchStatus?.(evt.message as string);
              else if (evt.type === 'meta' && evt.searchInfo)
                handlers.onMeta?.(evt.searchInfo as SearchInfo);
              else if (evt.type === 'done')
                handlers.onDone?.(evt as unknown as StreamDoneEvent);
              else if (evt.type === 'error')
                settle(() =>
                  reject(
                    new ChatRequestError(
                      (evt.error as string) ?? 'The AI could not process that message. Please try again.',
                      502,
                      evt,
                    ),
                  ),
                );
            } catch {
              /* malformed frame — skip */
            }
          }
        };

        /** Handle JSON body (image gen always returns JSON even with stream:true). */
        const handleJsonBody = (text: string) => {
          try {
            const data = JSON.parse(text) as Record<string, unknown>;
            const msg = data?.message as Record<string, unknown> | undefined;
            const content = typeof msg?.content === 'string' ? msg.content : '';
            if (!content) {
              settle(() =>
                reject(
                  new ChatRequestError('The AI returned an empty response. Please try again.', 502, {
                    error: 'empty_response',
                  }),
                ),
              );
              return;
            }
            handlers.onToken?.(content);
            const si = data?.searchInfo as SearchInfo | undefined;
            if (si && Array.isArray(si.sources) && si.sources.length > 0) handlers.onMeta?.(si);
            handlers.onDone?.({
              model: data?.model as string,
              conversationId: data?.conversationId as number | undefined,
              searchInfo: si,
              crawledUrls: data?.crawledUrls as string[] | undefined,
              crawledSources: data?.crawledSources as SearchSource[] | undefined,
              timeInfo: data?.timeInfo as TimeInfo | undefined,
              weatherInfo: data?.weatherInfo as WeatherInfo | undefined,
              guestMessageCount: data?.guestMessageCount as number | undefined,
              guestMessageLimit: data?.guestMessageLimit as number | undefined,
            });
            settle(() => resolve());
          } catch {
            settle(() =>
              reject(
                new ChatRequestError('The server sent back an incomplete response. Please try again.', 502, {
                  error: 'invalid_json',
                }),
              ),
            );
          }
        };

        xhr.onreadystatechange = () => {
          // readyState 3 = LOADING (partial body), 4 = DONE (full body)
          if (xhr.readyState < 3) return;

          // Consume any new bytes since last event
          const chunk = xhr.responseText.slice(offset);
          offset = xhr.responseText.length;
          if (chunk) {
            buffer += chunk;
            // During LOADING we only flush SSE frames; JSON bodies are
            // handled in full at DONE to avoid partial-parse failures.
            const ct = (xhr.getResponseHeader?.('content-type') ?? '').toLowerCase();
            if (!ct.includes('application/json')) flush();
          }

          if (xhr.readyState === 4) {
            if (xhr.status === 0) return; // xhr.abort() — onabort handles it

            if (xhr.status < 200 || xhr.status >= 300) {
              try {
                const err = JSON.parse(xhr.responseText) as Record<string, unknown>;
                settle(() =>
                  reject(
                    new ChatRequestError(
                      (err.error as string) ?? `Chat request failed (HTTP ${xhr.status}).`,
                      xhr.status,
                      err,
                    ),
                  ),
                );
              } catch {
                settle(() => reject(new ChatRequestError(`HTTP ${xhr.status}`, xhr.status, {})));
              }
              return;
            }

            const ct = (xhr.getResponseHeader?.('content-type') ?? '').toLowerCase();
            if (ct.includes('application/json')) {
              handleJsonBody(xhr.responseText);
              return;
            }

            // SSE path complete — flush any remaining frames
            flush();
            settle(() => resolve());
          }
        };

        xhr.ontimeout = () =>
          settle(() =>
            reject(
              new ChatRequestError(
                'Request timed out. The AI is taking too long — please try again.',
                408,
                { error: 'timeout' },
              ),
            ),
          );

        xhr.onerror = () =>
          settle(() =>
            reject(
              new ChatRequestError(
                'Could not reach the server. Check your connection and try again.',
                0,
                { error: 'network' },
              ),
            ),
          );

        xhr.onabort = () =>
          settle(() =>
            reject(Object.assign(new Error('The request was cancelled.'), { name: 'AbortError' })),
          );

        if (signal) {
          if (signal.aborted) {
            xhr.abort();
            return;
          }
          signal.addEventListener('abort', () => xhr.abort(), { once: true });
        }

        xhr.send(
          JSON.stringify({
            ...request,
            stream: true,
            userLocation: request.userLocation ?? DEVICE_LOCATION,
          }),
        );
      }),
  );
}

// Public model aliases are company-owned. The edge function keeps the
// historical 2.x aliases working for older clients and maps them internally.
export const CHAT_MODEL = 'engagera-pro';
export const LAB_MODEL = 'engagera-reason';
export const GUEST_MESSAGE_LIMIT = 5;
