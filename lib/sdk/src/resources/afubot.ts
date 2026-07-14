// ---------------------------------------------------------------------------
// Engagera SDK — AfuBot resource
//
// AfuBot is Engagera's web crawler / spider. It fetches live pages, extracts
// structured data (titles, og:images, snippets), and returns cited sources
// alongside a synthesised answer. AfuBot is NOT a streaming interface — it
// crawls, indexes, and responds synchronously. For token-by-token streaming
// use client.chat.stream() instead.
// ---------------------------------------------------------------------------

import type { HttpClient } from "../http.js";
import type {
  AfuBotSearchParams,
  AfuBotSearchResult,
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

function toMessages(query: string) {
  return [{ role: "user" as const, content: query }];
}

export class AfuBot {
  constructor(private readonly http: HttpClient) {}

  /**
   * Crawl the web for a query and return cited sources with a synthesised answer.
   *
   * AfuBot spiders relevant pages, extracts structured content (titles,
   * og:images, snippets), and returns everything in one response.
   * This call blocks until crawling and synthesis are complete.
   *
   * For streaming the AI answer token-by-token while results load,
   * use `client.chat.stream()` instead.
   *
   * @example
   * ```ts
   * const result = await client.afubot.search("latest SpaceX launch");
   *
   * console.log(result.answer);      // synthesised answer
   * console.log(result.searchQuery); // query AfuBot issued internally
   * result.sources.forEach(s => {
   *   console.log(s.title, s.url, s.image);
   * });
   * ```
   */
  async search(
    query: string | AfuBotSearchParams,
  ): Promise<AfuBotSearchResult> {
    const params = typeof query === "string" ? { query } : query;

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
}
