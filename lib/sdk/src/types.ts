// ---------------------------------------------------------------------------
// Engagera SDK — Shared Types
// ---------------------------------------------------------------------------

/** A web source surfaced by AfuBot during a search. */
export interface Source {
  url: string;
  title: string;
  /** og:image or favicon extracted from the page, if available. */
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
  | "engagera-2.0"
  | "engagera-2.1"
  | "engagera-pro"
  | "afubot-search"
  | (string & {}); // allow arbitrary strings for forward-compat

export interface ChatCreateParams {
  messages: Message[];
  model?: EngageraModel;
  /** Pass an existing ID to continue a conversation. */
  conversationId?: string;
  /** Extra hint to bias AfuBot's search behaviour. */
  contextHint?: string;
}

export interface ChatResponse {
  /** Full assistant reply. */
  content: string;
  model: string;
  conversationId?: string;
  sources?: Source[];
  searchInfo?: { query: string; sources: Source[] };
  timeInfo?: TimeInfo;
  usage: Usage;
}

// ---------------------------------------------------------------------------
// Chat streaming event types
// ---------------------------------------------------------------------------

export interface ChatStreamEventText {
  type: "text";
  text: string;
}

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
  sources?: Source[];
  timeInfo?: TimeInfo;
  usage: Usage;
}

export interface ChatStreamEventError {
  type: "error";
  message: string;
}

export type ChatStreamEvent =
  | ChatStreamEventText
  | ChatStreamEventSources
  | ChatStreamEventDone
  | ChatStreamEventError;

// ---------------------------------------------------------------------------
// AfuBot types
// ---------------------------------------------------------------------------

export interface AfuBotSearchParams {
  query: string;
  model?: EngageraModel;
  contextHint?: string;
  /** Conversation ID to carry context across searches. */
  conversationId?: string;
}

export interface AfuBotSearchResult {
  /** Full natural-language answer from AfuBot. */
  answer: string;
  /** Web sources cited in the answer. */
  sources: Source[];
  /** The search query AfuBot issued internally. */
  searchQuery: string;
  conversationId?: string;
  timeInfo?: TimeInfo;
  usage: Usage;
}

// AfuBot streaming events — a friendlier subset of ChatStreamEvent
export interface AfuBotStreamEventText {
  type: "text";
  text: string;
}

export interface AfuBotStreamEventSources {
  type: "sources";
  searchQuery: string;
  sources: Source[];
}

export interface AfuBotStreamEventDone {
  type: "done";
  answer: string;
  sources: Source[];
  searchQuery: string;
  conversationId?: string;
  timeInfo?: TimeInfo;
  usage: Usage;
}

export interface AfuBotStreamEventError {
  type: "error";
  message: string;
}

export type AfuBotStreamEvent =
  | AfuBotStreamEventText
  | AfuBotStreamEventSources
  | AfuBotStreamEventDone
  | AfuBotStreamEventError;

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
  /** Default model to use when none is specified. Defaults to `"engagera-2.0"`. */
  defaultModel?: EngageraModel;
  /** Request timeout in milliseconds. Defaults to 120 000 (2 min). */
  timeout?: number;
}
