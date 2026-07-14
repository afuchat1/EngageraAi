// ---------------------------------------------------------------------------
// Engagera SDK — Main Client
// ---------------------------------------------------------------------------

import { HttpClient } from "./http.js";
import { Chat } from "./resources/chat.js";
import { AfuBot } from "./resources/afubot.js";
import type { EngageraClientOptions } from "./types.js";

/**
 * The Engagera SDK client. Create one instance per application.
 *
 * @example
 * ```ts
 * import Engagera from "@engagera/sdk";
 *
 * const client = new Engagera({ apiKey: "eng_..." });
 *
 * // AfuBot web search
 * const result = await client.afubot.search("latest AI breakthroughs");
 * console.log(result.answer);
 *
 * // Streaming search
 * for await (const event of client.afubot.stream("tech news today")) {
 *   if (event.type === "text") process.stdout.write(event.text);
 * }
 * ```
 */
export class Engagera {
  /** AfuBot — Engagera's live web-search AI. Build search engines with this. */
  readonly afubot: AfuBot;

  /** Generic chat completions with optional web-search augmentation. */
  readonly chat: Chat;

  constructor(options: EngageraClientOptions) {
    const http = new HttpClient(options);
    this.afubot = new AfuBot(http);
    this.chat = new Chat(http);
  }
}
