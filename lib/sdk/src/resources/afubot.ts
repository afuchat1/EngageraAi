// ---------------------------------------------------------------------------
// Engagera SDK — AfuBot resource
//
// AfuBot is Engagera's web-search AI. It crawls live pages, extracts
// og:images and snippets, and synthesises a cited natural-language answer.
// Use it to power search engines, research tools, and news aggregators.
// ---------------------------------------------------------------------------

import type { HttpClient } from "../http.js";
import { parseSSEStream } from "../streaming.js";
import { EngageraStreamError } from "../error.js";
import type {
  AfuBotSearchParams,
  AfuBotSearchResult,
  AfuBotStreamEvent,
  Source,
} from "../types.js";

function normaliseSource(s: Record<string, unknown>): Source {
  return {
    url: (s.url as string) ?? "",
    title: (s.title as string) ?? "",
    image: s.image as string | undefined,
    snippet: s.snippet as string | undefined,
  };
}

/** Wrap a plain query string into the messages array AfuBot expects. */
function toMessages(query: string) {
  return [{ role: "user" as const, content: query }];
}

export class AfuBot {
  constructor(private readonly http: HttpClient) {}

  /**
   * Search the web and get a fully-synthesised answer with cited sources.
   * Blocks until the entire response is ready.
   *
   * @example
   * ```ts
   * const result = await client.afubot.search("latest SpaceX launch");
   * console.log(result.answer);
   * result.sources.forEach(s => console.log(s.title, s.url));
   * ```
   */
  async search(
    query: string | AfuBotSearchParams,
  ): Promise<AfuBotSearchResult> {
    const params =
      typeof query === "string" ? { query } : query;

    const body = {
      messages: toMessages(params.query),
      model: params.model ?? this.http.defaultModel,
      conversationId: params.conversationId,
      contextHint: params.contextHint,
      stream: false,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (await this.http.post("/chat", body, false)) as any;

    const rawSources: Source[] = (
      raw.crawledSources ??
      raw.searchInfo?.sources ??
      []
    ).map(normaliseSource);

    return {
      answer: raw.message?.content ?? raw.content ?? "",
      sources: rawSources,
      searchQuery: raw.searchInfo?.query ?? params.query,
      conversationId: raw.conversationId,
      timeInfo: raw.timeInfo,
      usage: {
        promptTokens: raw.usage?.prompt_tokens ?? 0,
        completionTokens: raw.usage?.completion_tokens ?? 0,
        totalTokens:
          (raw.usage?.prompt_tokens ?? 0) + (raw.usage?.completion_tokens ?? 0),
      },
    };
  }

  /**
   * Stream AfuBot's response in real-time.
   * Yields `text` events as tokens arrive, then a `sources` event when
   * web results are ready, and finally a `done` event with the full answer.
   *
   * @example
   * ```ts
   * for await (const event of client.afubot.stream("AI news today")) {
   *   if (event.type === "text")    process.stdout.write(event.text);
   *   if (event.type === "sources") console.log(event.sources);
   *   if (event.type === "done")    console.log("\n✓", event.answer);
   * }
   * ```
   */
  async *stream(
    query: string | AfuBotSearchParams,
  ): AsyncGenerator<AfuBotStreamEvent> {
    const params =
      typeof query === "string" ? { query } : query;

    const body = {
      messages: toMessages(params.query),
      model: params.model ?? this.http.defaultModel,
      conversationId: params.conversationId,
      contextHint: params.contextHint,
      stream: true,
    };

    const response = await this.http.post("/chat", body, true);

    let fullAnswer = "";
    let finalSources: Source[] = [];
    let searchQuery = params.query;

    for await (const event of parseSSEStream(response)) {
      switch (event.type) {
        case "meta": {
          const rawSources = (
            event.data.crawledSources ??
            event.data.searchInfo?.sources ??
            []
          ).map(normaliseSource);
          finalSources = rawSources;
          searchQuery = event.data.searchInfo?.query ?? params.query;

          yield {
            type: "sources",
            searchQuery,
            sources: rawSources,
          };
          break;
        }
        case "text": {
          const chunk = (event.data.text ?? event.data.content ?? "") as string;
          fullAnswer += chunk;
          yield { type: "text", text: chunk };
          break;
        }
        case "done": {
          const rawSources = (
            event.data.crawledSources ??
            event.data.searchInfo?.sources ??
            []
          ).map(normaliseSource);
          if (rawSources.length) finalSources = rawSources;

          yield {
            type: "done",
            answer: fullAnswer,
            sources: finalSources,
            searchQuery,
            conversationId: event.data.conversationId,
            timeInfo: event.data.timeInfo,
            usage: {
              promptTokens: event.data.usage?.prompt_tokens ?? 0,
              completionTokens: event.data.usage?.completion_tokens ?? 0,
              totalTokens:
                (event.data.usage?.prompt_tokens ?? 0) +
                (event.data.usage?.completion_tokens ?? 0),
            },
          };
          return;
        }
        case "error": {
          yield { type: "error", message: event.data.error ?? "Stream error" };
          throw new EngageraStreamError(event.data.error ?? "Stream error");
        }
      }
    }
  }
}
