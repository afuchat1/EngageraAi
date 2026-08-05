// ---------------------------------------------------------------------------
// Engagera SDK — Agents resource
// ---------------------------------------------------------------------------

import type { HttpClient } from "../http.js";
import type { EngageraModel, Message, Source, Usage } from "../types.js";

// ── Agent types ──────────────────────────────────────────────────────────────

export type AgentStatus = "active" | "disabled" | "draft";
export type AgentCategory =
  | "assistant"
  | "research"
  | "coding"
  | "writing"
  | "data"
  | "document"
  | "automation"
  | "memory"
  | "planner"
  | "custom";

export interface AgentTool {
  name: string;
  description?: string;
  enabled: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  version: string;
  systemInstructions: string;
  model: EngageraModel;
  tools: AgentTool[];
  memoryEnabled: boolean;
  executionLimitSeconds?: number;
  ownerId?: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCreateParams {
  name: string;
  description?: string;
  category?: AgentCategory;
  systemInstructions?: string;
  model?: EngageraModel;
  tools?: AgentTool[];
  memoryEnabled?: boolean;
  executionLimitSeconds?: number;
}

export interface AgentUpdateParams extends Partial<AgentCreateParams> {
  status?: AgentStatus;
}

export interface AgentRunParams {
  /** The agent ID to run. */
  agentId: string;
  /** Messages to send to the agent. */
  messages: Message[];
  /** Optional conversation ID for multi-turn context. */
  conversationId?: string;
  /** Extra context hint passed to the agent. */
  contextHint?: string;
}

export interface AgentRunResponse {
  content: string;
  agentId: string;
  model: string;
  conversationId?: string;
  sources?: Source[];
  usage: Usage;
}

export interface AgentListResponse {
  agents: Agent[];
  total: number;
}

// ── Built-in Engagera agents (read-only, provided by the platform) ────────────

export const BUILTIN_AGENTS: Record<string, Pick<Agent, "id" | "name" | "description" | "category">> = {
  assistant: { id: "assistant", name: "Engagera Assistant", description: "General-purpose AI conversation across all topics", category: "assistant" },
  research: { id: "research", name: "Research Agent", description: "Deep web research, source analysis, and knowledge extraction", category: "research" },
  planner: { id: "planner", name: "Planner Agent", description: "Converts complex goals into structured, actionable plans", category: "planner" },
  coding: { id: "coding", name: "Coding Agent", description: "Write, debug, refactor, and review production-quality code", category: "coding" },
  writing: { id: "writing", name: "Writing Agent", description: "Articles, emails, reports, marketing content, and more", category: "writing" },
  data: { id: "data", name: "Data Agent", description: "Analyze datasets, find patterns, and generate insights", category: "data" },
  document: { id: "document", name: "Document Agent", description: "Read, summarize, and extract information from documents", category: "document" },
  automation: { id: "automation", name: "Automation Agent", description: "Create workflows, connect services, and trigger events", category: "automation" },
  memory: { id: "memory", name: "Memory Agent", description: "Manage and retrieve persistent knowledge and preferences", category: "memory" },
};

// ── Agents resource class ─────────────────────────────────────────────────────

export class Agents {
  constructor(private readonly http: HttpClient) {}

  /**
   * List all agents available to you (built-in + custom).
   *
   * @example
   * ```ts
   * const { agents } = await client.agents.list();
   * agents.forEach(a => console.log(a.name, a.category));
   * ```
   */
  async list(): Promise<AgentListResponse> {
    const raw = (await this.http.get("/agents")) as {
      agents?: unknown[];
      total?: number;
    };
    const agents = ((raw.agents ?? []) as Record<string, unknown>[]).map(normaliseAgent);
    return { agents, total: raw.total ?? agents.length };
  }

  /**
   * Get a single agent by ID.
   */
  async get(agentId: string): Promise<Agent> {
    const raw = (await this.http.get(`/agents/${agentId}`)) as Record<string, unknown>;
    return normaliseAgent(raw);
  }

  /**
   * Create a new custom agent.
   *
   * @example
   * ```ts
   * const agent = await client.agents.create({
   *   name: "Customer Support Bot",
   *   description: "Handles billing and account questions",
   *   systemInstructions: "You are a friendly support agent for Acme Corp...",
   *   model: "engagera-pro",
   *   tools: [{ name: "search", enabled: true }],
   * });
   * ```
   */
  async create(params: AgentCreateParams): Promise<Agent> {
    const raw = (await this.http.post("/agents", params, false)) as Record<string, unknown>;
    return normaliseAgent(raw);
  }

  /**
   * Update an existing custom agent.
   */
  async update(agentId: string, params: AgentUpdateParams): Promise<Agent> {
    const raw = (await this.http.patch(`/agents/${agentId}`, params)) as Record<string, unknown>;
    return normaliseAgent(raw);
  }

  /**
   * Delete a custom agent. Built-in agents cannot be deleted.
   */
  async delete(agentId: string): Promise<void> {
    await this.http.delete(`/agents/${agentId}`);
  }

  /**
   * Disable a custom agent without deleting it.
   */
  async disable(agentId: string): Promise<Agent> {
    return this.update(agentId, { status: "disabled" });
  }

  /**
   * Re-enable a disabled agent.
   */
  async enable(agentId: string): Promise<Agent> {
    return this.update(agentId, { status: "active" });
  }

  /**
   * Run an agent on a set of messages and receive the full response.
   *
   * @example
   * ```ts
   * const result = await client.agents.run({
   *   agentId: "research",
   *   messages: [{ role: "user", content: "Summarize the latest AI breakthroughs" }],
   * });
   * console.log(result.content);
   * ```
   */
  async run(params: AgentRunParams): Promise<AgentRunResponse> {
    const body = {
      messages: params.messages,
      agent: params.agentId,
      conversationId: params.conversationId,
      contextHint: params.contextHint,
      useAfuBot: params.agentId === "research",
      stream: false,
    };
    const raw = (await this.http.post("/chat", body, false)) as Record<string, unknown>;
    const rawSources = ((raw.crawledSources ?? (raw as any).searchInfo?.sources ?? []) as Record<string, unknown>[]).map(s => ({
      url: (s.url as string) ?? "",
      title: (s.title as string) ?? "",
      image: s.image as string | undefined,
      snippet: s.snippet as string | undefined,
    }));
    return {
      content: (raw as any).message?.content ?? raw.content ?? "",
      agentId: params.agentId,
      model: (raw.model as string) ?? "engagera-pro",
      conversationId: raw.conversationId as string | undefined,
      sources: rawSources.length ? rawSources : undefined,
      usage: {
        promptTokens: (raw as any).usage?.inputTokens ?? 0,
        completionTokens: (raw as any).usage?.outputTokens ?? 0,
        totalTokens: (raw as any).usage?.totalTokens ?? 0,
      },
    };
  }
}

function normaliseAgent(raw: Record<string, unknown>): Agent {
  return {
    id: (raw.id as string) ?? "",
    name: (raw.name as string) ?? "",
    description: (raw.description as string) ?? "",
    category: (raw.category as AgentCategory) ?? "custom",
    version: (raw.version as string) ?? "1.0.0",
    systemInstructions: (raw.system_instructions ?? raw.systemInstructions ?? "") as string,
    model: (raw.model as EngageraModel) ?? "engagera-pro",
    tools: ((raw.tools as AgentTool[]) ?? []),
    memoryEnabled: (raw.memory_enabled ?? raw.memoryEnabled ?? false) as boolean,
    executionLimitSeconds: (raw.execution_limit_seconds ?? raw.executionLimitSeconds) as number | undefined,
    ownerId: (raw.owner_id ?? raw.ownerId) as string | undefined,
    status: (raw.status as AgentStatus) ?? "active",
    createdAt: (raw.created_at ?? raw.createdAt ?? new Date().toISOString()) as string,
    updatedAt: (raw.updated_at ?? raw.updatedAt ?? new Date().toISOString()) as string,
  };
}
