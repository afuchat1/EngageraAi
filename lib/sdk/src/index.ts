// ---------------------------------------------------------------------------
// @afuchat1/engagera — Public API  v0.2.0
// ---------------------------------------------------------------------------

export { Engagera } from "./client.js";
export { Engagera as default } from "./client.js";

// Resources
export { AfuBot } from "./resources/afubot.js";
export { Chat } from "./resources/chat.js";
export { Agents, BUILTIN_AGENTS } from "./resources/agents.js";
export { Memory_ as MemoryResource } from "./resources/memory.js";
export { Workflows } from "./resources/workflows.js";

// Errors
export {
  EngageraError,
  EngageraAuthError,
  EngageraRateLimitError,
  EngageraStreamError,
} from "./error.js";

// Shared types
export type {
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
} from "./types.js";

// Agent types
export type {
  Agent,
  AgentCreateParams,
  AgentUpdateParams,
  AgentRunParams,
  AgentRunResponse,
  AgentListResponse,
  AgentStatus,
  AgentCategory,
  AgentTool,
} from "./resources/agents.js";

// Memory types
export type {
  Memory,
  MemoryCreateParams,
  MemorySearchParams,
  MemoryListResponse,
  MemoryType,
} from "./resources/memory.js";

// Workflow types
export type {
  Workflow,
  WorkflowCreateParams,
  WorkflowRunParams,
  WorkflowRunResult,
  WorkflowStatus,
  WorkflowTrigger,
  WorkflowStep,
} from "./resources/workflows.js";
