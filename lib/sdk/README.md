# @engagera/sdk

The official TypeScript SDK for [Engagera](https://engagera.com).

Two building blocks:

| | What it does | Streaming? |
|---|---|---|
| **AfuBot** | Crawls the live web — spiders pages, extracts titles, images & snippets, returns cited sources | ✗ Returns synchronously |
| **Chat** | AI completions that can call AfuBot internally | ✓ Token-by-token SSE |

---

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

## AfuBot — Web Crawler / Spider

AfuBot is a crawler, not an AI streamer. You give it a query; it spiders
relevant live pages, extracts structured data (og:images, titles, snippets),
and returns everything in one synchronous response.

```ts
const result = await client.afubot.search("SpaceX Starship latest launch");

console.log(result.answer);        // synthesised answer from crawled content
console.log(result.searchQuery);   // query AfuBot used internally
console.log(result.sources);       // crawled pages: url, title, image, snippet
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
  contextHint: "focus on range and charging speed",  // steers what AfuBot crawls
  conversationId: "abc-123",                          // carry context across calls
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
      title: s.title,
      url: s.url,
      thumbnail: s.image,
      preview: s.snippet,
    })),
  };
}
```

---

## Chat — AI Completions

For AI responses that may internally invoke AfuBot to fetch live data.
Use `chat` when you need streaming or multi-turn conversation.

### Non-streaming

```ts
const reply = await client.chat.create({
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user",   content: "What happened in tech this week?" },
  ],
});

console.log(reply.content);   // full AI answer
console.log(reply.sources);   // pages AfuBot crawled (if triggered)
```

### Streaming — token-by-token

```ts
for await (const event of client.chat.stream({
  messages: [{ role: "user", content: "Summarise today's AI news" }],
})) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.text);   // token arrives
      break;
    case "sources":
      console.log(event.sources);         // AfuBot finished crawling
      break;
    case "done":
      console.log("\n✓ done", event.usage);
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
  conversationId = reply.conversationId; // carry forward
  return reply.content;
}

await ask("Who won the last World Cup?");
await ask("And the one before that?");   // context maintained
```

---

## Models

| Model | Description |
|---|---|
| `engagera-2.0` | Default — fast, balanced |
| `engagera-2.1` | Latest generation |
| `engagera-pro` | Most capable |

---

## Error handling

```ts
import Engagera, { EngageraAuthError, EngageraRateLimitError } from "@engagera/sdk";

try {
  const result = await client.afubot.search("...");
} catch (err) {
  if (err instanceof EngageraAuthError)      console.error("Invalid API key");
  if (err instanceof EngageraRateLimitError) console.error("Rate limit hit — slow down");
}
```

---

## Configuration

```ts
const client = new Engagera({
  apiKey: "eng_...",              // required
  baseUrl: "https://...",         // optional — override for self-hosted deployments
  defaultModel: "engagera-pro",   // optional — model used when none is specified
  timeout: 60_000,                // optional — ms, default 120 000 (2 min)
});
```

---

## TypeScript

Written in TypeScript, ships full declarations. All methods, events, and
return types are typed — no `any` in your consumer code.

```ts
import type { AfuBotSearchResult, Source, ChatStreamEvent } from "@engagera/sdk";
```

---

## Runtime support

Zero dependencies — uses native `fetch`. Works in:

- Node.js 18+
- Browsers
- Cloudflare Workers / Vercel Edge / Deno
- Bun

---

## License

MIT © Engagera
