// ---------------------------------------------------------------------------
// @engagera/sdk — Public API
// ---------------------------------------------------------------------------

export { Engagera } from "./client.js";
export { Engagera as default } from "./client.js";

// Resources
export { AfuBot } from "./resources/afubot.js";
export { Chat } from "./resources/chat.js";

// Errors
export {
  EngageraError,
  EngageraAuthError,
  EngageraRateLimitError,
  EngageraStreamError,
} from "./error.js";

// Types — re-export everything so consumers get full type coverage
export type {
  // Shared
  Source,
  Usage,
  TimeInfo,
  Role,
  Message,
  EngageraModel,
  EngageraClientOptions,
  // Chat
  ChatCreateParams,
  ChatResponse,
  ChatStreamEvent,
  ChatStreamEventText,
  ChatStreamEventSources,
  ChatStreamEventDone,
  ChatStreamEventError,
  // AfuBot
  AfuBotSearchParams,
  AfuBotSearchResult,
  AfuBotStreamEvent,
  AfuBotStreamEventText,
  AfuBotStreamEventSources,
  AfuBotStreamEventDone,
  AfuBotStreamEventError,
} from "./types.js";
