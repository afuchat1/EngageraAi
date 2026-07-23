// ---------------------------------------------------------------------------
// Engagera SDK — Shared Types
// ---------------------------------------------------------------------------

/** A web source returned by AfuBot after crawling a page. */
export interface Source {
  url: string;
  title: string;
  /** og:image or favicon extracted from the live page, if available. */
  image?: string;
  snippet?: string;
}

/** Token-usage summary returned at the end of every response. */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Timezone / clock info returned when the query is time-sensitive. */
export interface TimeInfo {
  ianaZone: string;
  label: string;
  utcOffset: string;
}

/** Chat message roles. */
export type Role = "user" | "assistant" | "system";

export interface Message {
  role: Role;
  content: string;
}

// ---------------------------------------------------------------------------
// Chat types
// ---------------------------------------------------------------------------

export type EngageraModel =
  | "engagera-lite"
  | "engagera-pro"
  | "engagera-reason"
  | "engagera-code"
  | "engagera-vision"
  | "engagera-voice"
  | "engagera-image"
  | "engagera-2.0"
  | "engagera-2.1"
  | "afubot-search"
  | (string & {}); // allow arbitrary strings for forward-compat

export interface ChatCreateParams {
  messages: Message[];
  model?: EngageraModel;
  /** Pass an existing ID to continue a conversation. */
  conversationId?: string;
  /** Optional context passed to the assistant. */
  contextHint?: string;
  /** Explicitly add AfuBot live crawling to this chat request. Defaults to false. */
  useAfuBot?: boolean;
}

export interface ChatResponse {
  /** Full assistant reply. */
  content: string;
  model: string;
  conversationId?: string;
  /** Web sources returned only when AfuBot was explicitly enabled. */
  sources?: Source[];
  searchInfo?: { query: string; sources: Source[] };
  crawledUrls?: string[];
  crawledSources?: Source[];
  timeInfo?: TimeInfo;
  usage: Usage;
}

// ---------------------------------------------------------------------------
// Chat streaming event types
// (Streaming is a chat-layer feature — AfuBot itself is not a stream.)
// ---------------------------------------------------------------------------

export interface ChatStreamEventText {
  type: "text";
  text: string;
}

export interface ChatStreamEventStatus {
  type: "status";
  message: string;
}

/** Emitted only when an explicitly enabled AfuBot crawl has finished. */
export interface ChatStreamEventSources {
  type: "sources";
  searchQuery: string;
  sources: Source[];
}

export interface ChatStreamEventDone {
  type: "done";
  content: string;
  model: string;
  conversationId?: string;
  /** Web sources returned only when AfuBot was explicitly enabled. */
  sources?: Source[];
  crawledUrls?: string[];
  crawledSources?: Source[];
  timeInfo?: TimeInfo;
  usage: Usage;
}

export interface ChatStreamEventError {
  type: "error";
  message: string;
}

export type ChatStreamEvent =
  | ChatStreamEventText
  | ChatStreamEventStatus
  | ChatStreamEventSources
  | ChatStreamEventDone
  | ChatStreamEventError;

// ---------------------------------------------------------------------------
// AfuBot types
// AfuBot is a crawler / spider — results are returned synchronously, not streamed.
// ---------------------------------------------------------------------------

export interface AfuBotSearchParams {
  query: string;
  model?: EngageraModel;
  /** Steers what AfuBot crawls — e.g. "focus on pricing". */
  contextHint?: string;
  /** Conversation ID to maintain context across searches. */
  conversationId?: string;
}

export interface AfuBotSearchResult {
  /** Natural-language answer synthesised from crawled pages. */
  answer: string;
  /** Live web sources AfuBot crawled, with titles, urls, and og:images. */
  sources: Source[];
  /** The search query AfuBot issued internally. */
  searchQuery: string;
  conversationId?: string;
  timeInfo?: TimeInfo;
  usage: Usage;
}

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface EngageraClientOptions {
  /** Your Engagera API key (starts with `eng_`). */
  apiKey: string;
  /**
   * Override the base URL. Defaults to the Engagera production endpoint.
   * Useful for self-hosted deployments or local testing.
   */
  baseUrl?: string;
  /** Default model to use when none is specified. Defaults to `"engagera-pro"`. */
  defaultModel?: EngageraModel;
  /** Request timeout in milliseconds. Defaults to 120 000 (2 min). */
  timeout?: number;
}
