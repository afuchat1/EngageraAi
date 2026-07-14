# @engagera/sdk

The official TypeScript SDK for [Engagera](https://engagera.com) — build AI-powered search engines with **AfuBot**, our live web-search AI.

## Installation

```bash
npm install @engagera/sdk
# or
pnpm add @engagera/sdk
```

## Quick start

```ts
import Engagera from "@engagera/sdk";

const client = new Engagera({ apiKey: "eng_..." });
```

Get your API key from the Engagera dashboard.

---

## AfuBot — Web Search AI

AfuBot crawls live pages, extracts real content and images, and synthesises a cited natural-language answer. Use it to power search engines, news aggregators, and research tools.

### One-shot search

```ts
const result = await client.afubot.search("latest SpaceX launch");

console.log(result.answer);       // Full natural-language answer
console.log(result.searchQuery);  // The query AfuBot issued internally
console.log(result.sources);      // Web sources with url, title, image, snippet
```

### Streaming search (token-by-token)

```ts
for await (const event of client.afubot.stream("AI breakthroughs this week")) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.text);   // Stream tokens as they arrive
      break;
    case "sources":
      console.log(event.sources);         // Web sources (arrives early)
      break;
    case "done":
      console.log("\n✓", event.answer);   // Full answer + metadata
      console.log("Usage:", event.usage);
      break;
    case "error":
      console.error(event.message);
      break;
  }
}
```

### Search with options

```ts
const result = await client.afubot.search({
  query: "best electric cars 2025",
  model: "engagera-pro",          // optional — defaults to engagera-2.0
  contextHint: "focus on range",  // optional — steers the search
  conversationId: "abc-123",      // optional — continue a conversation
});
```

---

## Chat

For general-purpose chat completions with optional web-search augmentation.

### Non-streaming

```ts
const reply = await client.chat.create({
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user",   content: "Explain quantum entanglement simply." },
  ],
  model: "engagera-pro",
});

console.log(reply.content);
console.log(reply.sources);   // Cited web sources (if search was triggered)
```

### Streaming

```ts
for await (const event of client.chat.stream({
  messages: [{ role: "user", content: "What is happening in tech today?" }],
})) {
  if (event.type === "text") process.stdout.write(event.text);
  if (event.type === "done") console.log("\nDone.", event.usage);
}
```

### Multi-turn conversation

```ts
let conversationId: string | undefined;

async function ask(question: string) {
  const reply = await client.chat.create({
    messages: [{ role: "user", content: question }],
    conversationId,
  });
  conversationId = reply.conversationId; // carry the ID forward
  return reply.content;
}

console.log(await ask("Who won the last World Cup?"));
console.log(await ask("And the one before that?"));  // context is maintained
```

---

## Models

| Model | Description |
|---|---|
| `engagera-2.0` | Default — fast, balanced |
| `engagera-2.1` | Latest generation |
| `engagera-pro` | Most capable, slower |
| `afubot-search` | Search-optimised |

---

## Error handling

```ts
import Engagera, { EngageraAuthError, EngageraRateLimitError } from "@engagera/sdk";

try {
  const result = await client.afubot.search("...");
} catch (err) {
  if (err instanceof EngageraAuthError)      console.error("Bad API key");
  if (err instanceof EngageraRateLimitError) console.error("Slow down");
}
```

---

## Configuration

```ts
const client = new Engagera({
  apiKey: "eng_...",          // required
  baseUrl: "https://...",     // optional — for self-hosted deployments
  defaultModel: "engagera-pro", // optional — model used when none is specified
  timeout: 60_000,            // optional — ms (default: 120 000)
});
```

---

## TypeScript

The SDK is written in TypeScript and ships full type declarations. Every method, parameter, and event is typed — no `any` in your code.

```ts
import type { AfuBotSearchResult, Source, AfuBotStreamEvent } from "@engagera/sdk";
```

---

## Runtime support

Works anywhere `fetch` is available:
- Node.js 18+
- Browsers
- Edge runtimes (Cloudflare Workers, Vercel Edge, Deno)
- Bun

---

## License

MIT © Engagera
