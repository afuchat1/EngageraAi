# @afuchat1/engagera

The official TypeScript SDK for [Engagera](https://engagera.afuchat.com). Chat and **AfuBot**, our optional live web crawler, are separate capabilities.

[![npm version](https://img.shields.io/npm/v/@afuchat1/engagera)](https://www.npmjs.com/package/@afuchat1/engagera)
[![license](https://img.shields.io/npm/l/@afuchat1/engagera)](LICENSE)

Two building blocks:

| | What it does | Streaming? |
|---|---|---|
| **`client.afubot`** | Crawls the live web — spiders pages, extracts titles, images & snippets, returns cited sources | ✗ Synchronous |
| **`client.chat`** | AI completions; web crawling is opt-in with `useAfuBot` | ✓ Token-by-token SSE |

---

## Installation

```bash
npm install @afuchat1/engagera
# or
pnpm add @afuchat1/engagera
# or
yarn add @afuchat1/engagera
```

## Quick start

```ts
import Engagera from "@afuchat1/engagera";

const client = new Engagera({ apiKey: "eng_..." });
```

Get your API key from the [Engagera dashboard](https://engagera.com/dashboard).

---

## AfuBot — Web Crawler / Spider

AfuBot is a crawler, not an AI streamer. Pass it a query; it spiders relevant
live pages, extracts structured data (og:images, titles, snippets), and returns
everything in one synchronous response. Use it to build search engines,
news aggregators, and research tools.

### One-shot search

```ts
const result = await client.afubot.search("SpaceX Starship latest launch");

console.log(result.answer);       // synthesised answer from crawled content
console.log(result.searchQuery);  // query AfuBot issued internally
console.log(result.sources);      // crawled pages: url, title, image, snippet
```

### Source object

```ts
result.sources.forEach(source => {
  console.log(source.url);      // "https://space.com/..."
  console.log(source.title);    // "SpaceX Starship completes..."
  console.log(source.image);    // og:image extracted from the live page
  console.log(source.snippet);  // text preview
});
```

### Search with options

```ts
const result = await client.afubot.search({
  query: "best electric cars 2025",
  contextHint: "focus on range and charging speed",
  conversationId: "abc-123",   // carry context across searches
  model: "engagera-pro",
});
```

### Build a search engine

```ts
async function search(userQuery: string) {
  const { sources, answer } = await client.afubot.search(userQuery);

  return {
    answer,
    cards: sources.map(s => ({
      title:     s.title,
      url:       s.url,
      thumbnail: s.image,
      preview:   s.snippet,
    })),
  };
}
```

---

## Chat — AI Completions

General-purpose AI completions. Chat does not crawl the web by default.
Use `useAfuBot: true` only when you explicitly want to add AfuBot live
crawling to a chat request, or use the standalone `client.afubot` resource.

API requests are a separate product boundary from the Engagera platform:
developer API calls do not read or write platform memories, settings,
documents, or conversation history. Any application instructions or dataset
context must be supplied and controlled by the developer's own environment.

### Non-streaming

```ts
const reply = await client.chat.create({
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user",   content: "What happened in tech this week?" },
  ],
  useAfuBot: true,
});

console.log(reply.content);  // full AI answer
console.log(reply.sources);  // pages AfuBot crawled when explicitly enabled
```

### Streaming — token-by-token

```ts
for await (const event of client.chat.stream({
  messages: [{ role: "user", content: "Summarise today's AI news" }],
})) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.text);  // token arrives
      break;
    case "sources":
      console.log(event.sources);        // AfuBot finished crawling
      break;
    case "done":
      console.log("\n✓", event.usage);
      break;
    case "error":
      console.error(event.message);
      break;
  }
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
  conversationId = reply.conversationId;
  return reply.content;
}

await ask("Who won the last World Cup?");
await ask("And the one before that?");  // context maintained
```

---

### Advanced reasoning

Use `engagera-reason` for deep analysis, planning, trade-off evaluation, and
careful multi-step problem solving. Reasoning runs privately on the server and
only the final answer is returned. Internal notes, routing, and providers are
never exposed.

```ts
const reply = await client.chat.create({
  model: "engagera-reason",
  messages: [
    { role: "user", content: "Compare these architectures and recommend one." },
  ],
});
```

---

## Models

| Model | Description |
|---|---|
| `engagera-lite` | Fast answers for lightweight tasks |
| `engagera-pro` | Default — best all-around model |
| `engagera-reason` | Deep reasoning and analysis |
| `engagera-code` | Production software engineering |
| `engagera-vision` | Image and document understanding |
| `engagera-image` | Image generation and editing |

Legacy `engagera-2.0` and `engagera-2.1` aliases remain accepted for existing clients.

---

## Error handling

```ts
import Engagera, {
  EngageraError,
  EngageraAuthError,
  EngageraRateLimitError,
  EngageraStreamError,
} from "@afuchat1/engagera";

try {
  const result = await client.afubot.search("...");
} catch (err) {
  if (err instanceof EngageraAuthError)      console.error("Invalid API key");
  if (err instanceof EngageraRateLimitError) console.error("Rate limit hit");
  if (err instanceof EngageraStreamError)    console.error("Stream broke:", err.message);
  if (err instanceof EngageraError)          console.error("API error:", err.status, err.message);
}
```

---

## Configuration

```ts
const client = new Engagera({
  apiKey:       "eng_...",         // required
  baseUrl:      "https://...",     // optional — for self-hosted deployments
  defaultModel: "engagera-pro",    // optional — used when no model is specified
  timeout:      60_000,            // optional — ms (default: 120 000 / 2 min)
});
```

---

## TypeScript

Written in TypeScript, ships full declarations. All methods, parameters,
and events are typed — no `any` in your consumer code.

```ts
import type {
  AfuBotSearchResult,
  AfuBotSearchParams,
  Source,
  ChatStreamEvent,
  ChatResponse,
  Message,
  Usage,
} from "@afuchat1/engagera";
```

---

## Runtime support

Zero dependencies — uses native `fetch`. Works in:

- **Node.js** 18+
- **Browsers**
- **Edge runtimes** — Cloudflare Workers, Vercel Edge, Deno
- **Bun**

---

## Publishing / self-hosting

The `baseUrl` option lets you point the SDK at your own backend:

```ts
const client = new Engagera({
  apiKey:  "your-key",
  baseUrl: "https://your-own-api.com/v1",
});
```

---

## License

MIT © AfuChat
