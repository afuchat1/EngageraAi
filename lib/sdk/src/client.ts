// ---------------------------------------------------------------------------
// @afuchat1/engagera — Main Client
// ---------------------------------------------------------------------------

import { HttpClient } from "./http.js";
import { Chat } from "./resources/chat.js";
import { AfuBot } from "./resources/afubot.js";
import { Agents } from "./resources/agents.js";
import { Memory_ as MemoryResource } from "./resources/memory.js";
import { Workflows } from "./resources/workflows.js";
import type { EngageraClientOptions } from "./types.js";

/**
 * The Engagera AI Platform client. Create one instance per application.
 *
 * @example
 * ```ts
 * import Engagera from "@afuchat1/engagera";
 *
 * const client = new Engagera({ apiKey: "eng_..." });
 *
 * // Run a specialized agent
 * const result = await client.agents.run({
 *   agentId: "research",
 *   messages: [{ role: "user", content: "Latest AI breakthroughs" }],
 * });
 *
 * // Chat with streaming
 * for await (const event of client.chat.stream({
 *   messages: [{ role: "user", content: "Summarise today's tech news" }],
 * })) {
 *   if (event.type === "text") process.stdout.write(event.text);
 * }
 *
 * // Manage memory
 * await client.memory.add({ content: "User prefers TypeScript", type: "user" });
 *
 * // Build a multi-agent workflow
 * const wf = await client.workflows.create({
 *   name: "Content Pipeline",
 *   steps: [
 *     { name: "Research", agentId: "research", prompt: "Find top AI topics this week" },
 *     { name: "Write", agentId: "writing", prompt: "Write an article", dependsOn: ["Research"] },
 *   ],
 * });
 * ```
 */
export class Engagera {
  /**
   * AfuBot — Engagera's web crawler / spider.
   * Fetches live pages, extracts structured data, returns cited sources.
   * Synchronous — not a stream.
   */
  readonly afubot: AfuBot;

  /** Chat completions with optional streaming and AfuBot web search. */
  readonly chat: Chat;

  /**
   * Agent Engine — run built-in or custom specialized AI agents.
   * Includes: assistant, research, planner, coding, writing, data, document, automation, memory.
   */
  readonly agents: Agents;

  /**
   * Memory — persistent facts and preferences, searchable across sessions.
   */
  readonly memory: MemoryResource;

  /**
   * Workflow Engine — build and run multi-agent pipelines.
   */
  readonly workflows: Workflows;

  constructor(options: EngageraClientOptions) {
    const http = new HttpClient(options);
    this.afubot = new AfuBot(http);
    this.chat = new Chat(http);
    this.agents = new Agents(http);
    this.memory = new MemoryResource(http);
    this.workflows = new Workflows(http);
  }
}
