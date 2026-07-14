// ---------------------------------------------------------------------------
// Engagera SDK — Chat resource
// ---------------------------------------------------------------------------

import type { HttpClient } from "../http.js";
import { parseSSEStream } from "../streaming.js";
import { EngageraStreamError } from "../error.js";
import type {
  ChatCreateParams,
  ChatResponse,
  ChatStreamEvent,
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

export class Chat {
  constructor(private readonly http: HttpClient) {}

  /**
   * Send a chat message and receive the full response once generation is complete.
   *
   * @example
   * ```ts
   * const reply = await client.chat.create({
   *   messages: [{ role: "user", content: "Explain quantum entanglement" }],
   * });
   * console.log(reply.content);
   * ```
   */
  async create(params: ChatCreateParams): Promise<ChatResponse> {
    const body = {
      messages: params.messages,
      model: params.model ?? this.http.defaultModel,
      conversationId: params.conversationId,
      contextHint: params.contextHint,
      stream: false,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (await this.http.post("/chat", body, false)) as any;

    const rawSources: Source[] =
      (raw.crawledSources ?? raw.searchInfo?.sources ?? []).map(
        normaliseSource,
      );

    return {
      content: raw.message?.content ?? raw.content ?? "",
      model: raw.model ?? body.model,
      conversationId: raw.conversationId,
      sources: rawSources.length ? rawSources : undefined,
      searchInfo: raw.searchInfo
        ? {
            query: raw.searchInfo.query ?? "",
            sources: (raw.searchInfo.sources ?? []).map(normaliseSource),
          }
        : undefined,
      timeInfo: raw.timeInfo,
      usage: {
        promptTokens: raw.usage?.prompt_tokens ?? 0,
        completionTokens: raw.usage?.completion_tokens ?? 0,
        totalTokens:
          (raw.usage?.prompt_tokens ?? 0) +
          (raw.usage?.completion_tokens ?? 0),
      },
    };
  }

  /**
   * Stream a chat response token-by-token using an async iterator.
   *
   * @example
   * ```ts
   * for await (const event of client.chat.stream({ messages: [...] })) {
   *   if (event.type === "text") process.stdout.write(event.text);
   *   if (event.type === "done") console.log("\nSources:", event.sources);
   * }
   * ```
   */
  async *stream(params: ChatCreateParams): AsyncGenerator<ChatStreamEvent> {
    const body = {
      messages: params.messages,
      model: params.model ?? this.http.defaultModel,
      conversationId: params.conversationId,
      contextHint: params.contextHint,
      stream: true,
    };

    const response = await this.http.post("/chat", body, true);
    let fullContent = "";
    let finalSources: Source[] | undefined;

    for await (const event of parseSSEStream(response)) {
      switch (event.type) {
        case "meta": {
          const rawSources = (
            event.data.crawledSources ??
            event.data.searchInfo?.sources ??
            []
          ).map(normaliseSource);
          finalSources = rawSources.length ? rawSources : undefined;
          yield {
            type: "sources",
            searchQuery: event.data.searchInfo?.query ?? "",
            sources: rawSources,
          };
          break;
        }
        case "text": {
          const chunk = (event.data.text ?? event.data.content ?? "") as string;
          fullContent += chunk;
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
            content: fullContent,
            model: event.data.model ?? body.model,
            conversationId: event.data.conversationId,
            sources: finalSources,
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
