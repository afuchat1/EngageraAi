// ---------------------------------------------------------------------------
// Engagera SDK — SSE stream parser
// Parses the raw text/event-stream response from the Engagera chat endpoint
// and yields typed objects. Works in Node 18+, browsers, and edge runtimes.
// ---------------------------------------------------------------------------

import { EngageraStreamError } from "./error.js";

export interface RawSSEEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

/**
 * Converts a fetch `Response` with `Content-Type: text/event-stream` into an
 * async iterator of parsed SSE events. Each event is `{ type, data }` where
 * `data` is the parsed JSON payload from the `data:` line.
 */
export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<RawSSEEvent> {
  if (!response.body) {
    throw new EngageraStreamError("Response body is null — cannot read stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE blocks are separated by blank lines (\n\n)
      const blocks = buffer.split(/\n\n/);
      // Keep the last (possibly incomplete) block in the buffer
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim()) continue;

        let eventType = "message";
        let dataLine = "";

        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLine = line.slice(5).trim();
          }
        }

        if (!dataLine) continue;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(dataLine);
        } catch {
          // Ignore non-JSON data lines
          continue;
        }

        // The edge function embeds `type` inside the JSON payload
        const type = (parsed.type as string) ?? eventType;
        yield { type, data: parsed };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
