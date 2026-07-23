// ---------------------------------------------------------------------------
// @afuchat1/engagera — Main Client
// ---------------------------------------------------------------------------

import { HttpClient } from "./http.js";
import { Chat } from "./resources/chat.js";
import { AfuBot } from "./resources/afubot.js";
import type { EngageraClientOptions } from "./types.js";

/**
 * The AfuChat SDK client. Create one instance per application.
 *
 * @example
 * ```ts
 * import Engagera from "@afuchat1/engagera";
 *
 * const client = new Engagera({ apiKey: "eng_..." });
 *
 * // AfuBot web search (synchronous crawler)
 * const result = await client.afubot.search("latest AI breakthroughs");
 * console.log(result.answer);
 * console.log(result.sources); // crawled pages with images & snippets
 *
 * // Chat with streaming
 * for await (const event of client.chat.stream({
 *   messages: [{ role: "user", content: "Summarise today's tech news" }],
 * })) {
 *   if (event.type === "text") process.stdout.write(event.text);
 * }
 * ```
 */
export class Engagera {
  /**
   * AfuBot — Engagera's web crawler / spider.
   * Fetches live pages, extracts structured data, returns cited sources.
   * Synchronous — not a stream.
   */
  readonly afubot: AfuBot;

  /** Chat completions without web crawling by default. AfuBot can be explicitly opted in. */
  readonly chat: Chat;

  constructor(options: EngageraClientOptions) {
    const http = new HttpClient(options);
    this.afubot = new AfuBot(http);
    this.chat = new Chat(http);
  }
}
