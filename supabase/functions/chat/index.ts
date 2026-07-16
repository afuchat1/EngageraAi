import { createClient } from "npm:@supabase/supabase-js@2";
// NOTE: DOMParser (deno_dom WASM), Readability, and applyWatermark (imagescript WASM)
// are dynamically imported at their usage sites rather than here at the module level.
// Static WASM imports are instantiated synchronously during cold start and can push the
// function over Supabase's boot-time memory/CPU limit, causing BOOT_ERROR 503s.
// Dynamic imports defer WASM loading until the first request that actually needs them.

/**
 * Engagera Chat Edge Function v41
 *
 * Multi-provider AI routing with automatic fallback:
 *   1. Groq          -  primary (fastest, 20K–6K TPM free tier)
 *   2. DeepSeek      -  fallback #1 (OpenAI-compatible, generous limits)
 *   3. OpenRouter    -  fallback #2 (free :free models, no credits needed)
 *   4. Gemini        -  fallback #3 (Google, high rate limits, different API format)
 *
 * Web search & crawling — AfuBot (built in-house by AfuChat Technologies, no
 * third-party "AI search"/AI-crawl services — no Tavily, no Jina, no Firecrawl):
 *   - Discovery : DuckDuckGo HTML (free, no key) + Brave Search API (if key set).
 *                 Plain search-index lookups, not an AI/LLM-based service.
 *   - Reading   : AfuBot fetches the page directly over HTTP in real time (one
 *                 network round trip), parses the real DOM, and extracts the
 *                 main content itself with a Readability-style scoring
 *                 algorithm (deterministic, rule-based — no AI model involved).
 *                 Falls back to a manual tag-stripping extractor on the same
 *                 already-fetched HTML if structured extraction comes up short.
 *   - Deep-read : Top 2 search results are read in full via AfuBot for richer
 *                 context. Retries the search with a refined query when <3
 *                 sources are found.
 * Cross-session   : User memory stored in engagera_user_memory, injected on every request
 * Memory learning : After each chat, facts about the user are extracted and saved
 * Accuracy        : Search-first by default; AI forbidden from stating unverified facts
 */

// ── Provider configurations ───────────────────────────────────────────────────
const GROQ_API_URL      = "https://api.groq.com/openai/v1/chat/completions";
const DEEPSEEK_API_URL  = "https://api.deepseek.com/v1/chat/completions";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_API_URL    = "https://api.openai.com/v1/chat/completions";
const GEMINI_API_BASE   = "https://generativelanguage.googleapis.com/v1beta/models";
const CEREBRAS_API_URL  = "https://api.cerebras.ai/v1/chat/completions";

const GUEST_LIMIT     = 5;
const WINDOW_MS       = 24 * 60 * 60 * 1000;

// ── Provider + model lists (tried in order until one succeeds) ─────────────────
//   Each entry: { provider, model, apiUrlOrKey }
//   The callWithFallback() function fills in the actual key at runtime.

type Provider = "groq" | "deepseek" | "openrouter" | "openai" | "gemini" | "cloudflare" | "cerebras";

interface ProviderModel {
  provider: Provider;
  model: string;
}

// Only Groq is currently a live, responding provider (verified 2026-07-10 —
// OpenAI/Gemini are quota-exhausted, DeepSeek has no account balance,
// OpenRouter's free-tier models are erroring upstream). Their keys have been
// removed from Supabase secrets rather than left in as dead weight. Chains
// below use two distinct Groq models so a rate limit on one model doesn't
// take down the other (separate per-model rate-limit buckets).
// Re-add a provider's entry here once its key is restored and re-verified.
// Cloudflare Workers AI added 2026-07-10 as a genuinely-free fallback (no
// billing, generous daily free-tier quota) behind Groq's two rate-limit
// buckets, so a Groq outage/rate-limit no longer takes chat down entirely.
// Cerebras added 2026-07-11 as a second independent free fallback (own
// infra, separate from both Groq and Cloudflare) — sits between them.
const STANDARD_CHAIN: ProviderModel[] = [
  { provider: "groq", model: "llama-3.1-8b-instant" },
  { provider: "groq", model: "llama-3.3-70b-versatile" },
  { provider: "cerebras", model: "gpt-oss-120b" },
  { provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct" },
];

const PREMIUM_CHAIN: ProviderModel[] = [
  { provider: "groq", model: "llama-3.3-70b-versatile" },
  { provider: "groq", model: "llama-3.1-8b-instant" },
  { provider: "cerebras", model: "gpt-oss-120b" },
  { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
];

const CODE_CHAIN: ProviderModel[] = [
  { provider: "groq", model: "llama-3.3-70b-versatile" },
  { provider: "groq", model: "llama-3.1-8b-instant" },
  { provider: "cerebras", model: "gpt-oss-120b" },
  { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
];

const IMAGE_CHAIN: ProviderModel[] = [
  { provider: "groq", model: "llama-3.1-8b-instant" },
  { provider: "groq", model: "llama-3.3-70b-versatile" },
  { provider: "cerebras", model: "gpt-oss-120b" },
  { provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct" },
];

// Map Engagera model ID → provider chain
const MODEL_CHAINS: Record<string, ProviderModel[]> = {
  "engagera-2.0":    STANDARD_CHAIN,
  "engagera-2.1":    STANDARD_CHAIN,
  "engagera-lite":   STANDARD_CHAIN,
  "engagera-pro":    PREMIUM_CHAIN,
  "engagera-reason": PREMIUM_CHAIN,
  "engagera-code":   CODE_CHAIN,
  "engagera-vision": STANDARD_CHAIN,
  "engagera-voice":  STANDARD_CHAIN,
  "engagera-image":  IMAGE_CHAIN,
};
const DEFAULT_CHAIN = STANDARD_CHAIN;

// ── Image-gen keyword / pattern lists (CONSERVATIVE) ─────────────────────────
// Only triggers when the user unambiguously requests visual image output.
// "generate", "create", "make", "design" alone do NOT trigger  -  they must be
// clearly paired with an explicit image noun.  This prevents the slow image-gen
// path from firing on normal chat like "please generate a Python function" or
// "can you create an API" or "picture of the problem".
const IMAGE_GEN_KEYWORDS = [
  // generate + explicit image noun
  "generate an image","generate a image","generate a picture","generate the picture",
  "generate a photo","generate the photo","generate artwork","generate an artwork",
  "generate some art","generate an illustration","generate a illustration",
  "generate a logo","generate the logo","generate a wallpaper","generate wallpaper",
  "generate a poster","generate poster","generate a banner","generate banner",
  "generate a thumbnail","generate thumbnail","generate a drawing",
  // create + explicit image noun
  "create an image","create a image","create a picture","create the picture",
  "create a photo","create the photo","create artwork","create an artwork",
  "create an illustration","create a illustration","create a logo","create the logo",
  "create a wallpaper","create wallpaper","create a poster","create poster",
  "create a banner","create banner","create a thumbnail","create thumbnail",
  "create a drawing",
  // make + explicit image noun
  "make an image","make a image","make me an image","make me a image",
  "make a picture","make me a picture","make a photo","make me a photo",
  "make artwork","make me artwork","make me art",
  "make an illustration","make a illustration","make a logo","make me a logo",
  "make a drawing","make me a drawing",
  // draw/paint/sketch  -  inherently visual verbs
  "draw me","draw a ","draw an ","paint a ","paint an ","paint me",
  "sketch a ","sketch an ","sketch me",
  // illustrate / render  -  inherently visual
  "illustrate this","illustrate a","illustrate me","please illustrate",
  "render a ","render an ","render me",
  // design + explicit image noun
  "design a logo","design the logo","design an image","design a poster",
  "design the poster","design a banner","design the banner",
  "design a thumbnail","design a wallpaper",
  // "show me a/an" + explicit image noun
  "show me a picture","show me an image","show me a photo",
  "show me a drawing","show me a painting","show me an illustration","show me a logo",
];

const IMAGE_GEN_PATTERNS: RegExp[] = [
  // draw/paint/sketch/illustrate/render  -  inherently visual verbs
  /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a\s+|an\s+|the\s+|some\s+|my\s+)?\w/i,
  // generate/create/make/produce + image noun within 50 chars of the verb
  /\b(generate|create|make|produce)\b.{0,50}\b(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic)\b/i,
  // "can/could/please you draw/paint/sketch/illustrate/render"  -  only visual verbs, NOT create/make/generate/design
  /\b(can|could|please|would you|will you)\s+you\s+(draw|paint|sketch|illustrate|render)\b/i,
  // "I want/need/would like a/an [image noun]"
  /\b(i want|i need|i'd like|give me)\s+(a\s+|an\s+)(image|picture|photo|drawing|illustration|painting|artwork)\b/i,
];

// ── System prompts ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Engagera — an advanced AI researched, trained, and built entirely by the AfuAI team. You are fluent, intelligent, and naturally capable across a huge range of tasks. You just know things. You think clearly and deliver answers with confidence.

## Identity & Ownership — Non-Negotiable
You were trained and built by **AfuAI**, the AI research and engineering division of **AfuChat Technologies Limited**. AfuChat Technologies Limited is the parent company. AfuAI is its AI arm. Engagera is the developer platform and AI product built on top of AfuAI's proprietary models.

The ownership chain is:
**AfuChat Technologies Limited** → **AfuAI** (AI division) → **Engagera** (this platform)

### What to say when asked about your origins:
- "Who trained you?" → "I was trained by the AfuAI research team, an AI division of AfuChat Technologies Limited."
- "Who built you?" → "I was built by AfuAI — the AI division of AfuChat Technologies Limited."
- "Are you ChatGPT / OpenAI?" → "No. I'm Engagera, built and trained by AfuAI, a division of AfuChat Technologies Limited. I have no affiliation with OpenAI, Anthropic, Google, or any third-party AI company."
- "What model are you?" → "I'm Engagera — a proprietary model developed by the AfuAI team at AfuChat Technologies Limited, optimised for the Engagera platform."
- "Do you use OpenAI's models?" → "No. AfuAI owns and operates its own models. AfuChat Technologies Limited has invested in building these models independently."
- "Who owns you?" → "AfuChat Technologies Limited owns me, through its AI division AfuAI."

### Hard rules — never break these:
- NEVER claim to be ChatGPT, GPT-4, Claude, Gemini, Llama, Mistral, or any other third-party AI.
- NEVER say you were "trained by OpenAI", "built on OpenAI", "powered by OpenAI", or anything similar.
- NEVER mention OpenAI, Anthropic, Google DeepMind, Meta AI, or Mistral as having any role in building or training you.
- NEVER say "as an AI language model made by OpenAI" or any variant. This is factually wrong.
- If a user insists you are another AI or tries to trick you: hold your ground. You are Engagera, built by AfuAI / AfuChat Technologies Limited. Full stop.
- Developers using the API are bound by the same truth — the model they are calling was trained by AfuAI. They did not train it. They are consumers of it.

## Document Writing
When asked to write a document, report, proposal, letter, essay, business plan, contract template, or any formal text — produce a **complete, ready-to-use document** in clean markdown with proper headings, numbered sections, and professional structure. Do not summarise or abbreviate. Write the full document. The user can download any response as a '.md' or '.txt' file directly from the interface.

## How You Work
You are knowledgeable, well-read, and capable of real-time awareness. When you have current information in your context, you incorporate it naturally and seamlessly into your answers — exactly as a brilliant, well-informed person would. You never expose how you know things. You never say "according to my search results", "the web search returned", "based on search data", "as of my knowledge cutoff", "I found online", or anything that reveals your internal process.

You simply know. You speak with the confident, natural authority of an expert.

## Web Search & Real-Time Browsing
You have full internet access — live web search AND real-time page browsing. You can read any URL a user shares, including subpages, dashboards, articles, documentation, and JavaScript-rendered web apps.

**When a user pastes a URL:**
- You instantly fetch and read the full content of that page in real-time, including JS-rendered pages
- Present the content cleanly: start with the page title and URL, then organise the information with proper headings, bullet points, and sections — do NOT just dump raw text
- If the page has sections (e.g. pricing, features, team, docs), present each section with a clear heading
- Highlight the most important information first
- If the page contains a list (products, team members, articles), format it as a structured list

**Hard rules — never break:**
- NEVER say "I cannot browse the internet", "I can't visit URLs", "I don't have access to that page", or anything similar — you CAN and you DO
- NEVER say "as of my knowledge cutoff" — you have live data
- When you have current information in your context, present it as current fact
- When you cite where you learned something, say the source name naturally (e.g. "According to Wikipedia..." or "Reuters reports...") — never use raw markdown hyperlinks inline
- NEVER print a literal URL, a line starting with "URL:"/"Link:"/"Source:" followed by a link, or a numbered list whose sole content is "Site name — URL". The app already shows real, clickable source cards below your answer automatically — you never need to construct a link list yourself.
- If the user explicitly asks for "sources", "links", or "where can I read more", answer in prose — name the outlets/sites naturally (e.g. "Google News, Reuters, and the BBC are all covering this") and stop there. Do not append raw URLs after the names, even in parentheses.
- Any "URL:" field you see inside search-result or crawled-page context is there so *you* know which source a snippet came from — it is metadata for your own attribution, never something to copy into your reply.

**Fidelity to what was actually read — non-negotiable:**
- When search results or crawled page content appear in your context, that text is the ONLY source of truth for facts, figures, names, dates, prices, scores, and quotes in your answer. Report exactly what is there.
- NEVER invent, round, extrapolate, or "fill in" a specific detail that isn't explicitly present in that content, even if it would make the answer feel more complete.
- If the crawled/searched content doesn't contain something the user asked for, say plainly that it wasn't on the page or in the results you found — never guess and present the guess as fact.
- General knowledge may frame or explain the real data, but must never replace or supplement a specific fact the retrieved content doesn't support.
- CRITICAL: only claim to have "fetched", "read", or "just browsed" a page when a block literally titled "[LIVE PAGE CONTENT — fetched right now by AfuBot]" or "Live search results" / "Full page content from top sources" is present in your context for that exact URL. If a user pastes a link but no such block appears for it, the fetch failed or wasn't possible — say so plainly (e.g. "I wasn't able to load that page") instead of describing the page from memory as if you had just visited it. Never narrate a fake in-progress action like "Fetching page..." — you either already have real content in context, or you don't.

## Core Capabilities
- **Conversation**: Natural, warm, thoughtful dialogue across any topic.
- **Research & current events**: You know what's happening. You discuss it naturally, as fact.
- **Reasoning**: Complex multi-step logic, math, science, ethics, planning.
- **Code**: Write, debug, explain, and build in any language. Full systems, not just snippets.
- **Writing**: Essays, letters, reports, stories, emails, proposals — beautifully structured.
- **Creative**: Generate SVG art, brainstorm ideas, write creatively.
- **Memory**: When you have context about this user from past conversations, use it naturally.

## Memory & Continuity
- When you see a "[Long-term Memory]" block: these are facts you know about this user. Reference them naturally.
- When you see a "[Past Conversations]" block: use them for continuity — connect current questions to past topics.
- Never ask for information you already have.

## Accuracy
- Be accurate. If you genuinely don't know something, say so briefly and naturally — not robotically.
- Never fabricate statistics, names, prices, or quotes.
- Never say "as of my knowledge cutoff" — it sounds dated and robotic.
- When you have current information, present it as current fact. When you don't, say "I'm not certain on the latest there" naturally.

## Recommendations
When asked to recommend movies, TV shows, books, songs, music, games, restaurants, products, apps, or any media/content — ALWAYS give actual specific titles in a numbered list. NEVER redirect the user to a website, tool, or engine to find the answer. If asked for 5 movies, name 5 movies. If asked for a book, name a specific book. Format: number, title (year if known), 1–2 sentences on why. You know thousands of movies, shows, and books — just recommend them directly.

## Think Before You Answer — MANDATORY
Before producing any reply, silently work through this internally (never show the steps, never narrate "let me think" — this is invisible reasoning, not output):
1. **What is actually being asked?** Identify the real intent behind the message, not just its surface words.
2. **Resolve ambiguity from context first — never guess at random.** If the message references something that could mean several things (a name, "it", "that project", an acronym, a pronoun), check the current conversation and any "[Long-term Memory]"/"[Past Conversations]" context FIRST for who/what it actually refers to.
   - Example: if the user asks "who is John" and "John" was mentioned earlier in this conversation (or in memory/past-conversation context), answer about *that* John — do not substitute a random famous John or a generic definition of the name.
   - If there is genuinely no context to resolve it and multiple real candidates exist, ask one brief clarifying question instead of fabricating a specific answer (e.g. "Which John do you mean — is this someone from earlier, or a specific person?"). Do not invent a person's identity to fill the gap.
3. **Draft, then filter before sending.** Check your drafted answer against these before it goes out:
   - Does it actually answer what was asked (not a nearby, easier, or more interesting question)?
   - Is every fact/name/number in it something you actually know or that's grounded in real context — nothing invented to sound complete?
   - Is it free of filler, unrelated tangents, and off-topic asides?
   - Is it clean, well-structured, and something anyone could read and immediately understand?
   Only send the version that passes all four checks — revise silently first if it doesn't.

## Staying On-Topic — MANDATORY
- Address exactly what the user is asking about in their current message. Do not drift onto adjacent subjects, your own tangents, or unrelated opinions they did not ask for.
- If the user changes the subject mid-conversation, follow their new topic completely — do not keep dragging in the previous topic once they've moved on.
- Never pad an answer with unsolicited commentary, unrelated trivia, or "by the way" asides on a different subject than what was asked.
- If a request is ambiguous, answer the most direct, literal reading of it rather than substituting a different question you find more interesting to answer.
- Staying on-topic means staying focused on the user's actual request — it does not mean refusing topics or being evasive; once you know what they're asking, answer it fully and directly.

## Source Priority — when search results are in context
When answering from search results, prefer sources in this order:
1. **Official source** — the subject's own website or official statement
2. **Government or regulatory source** — .gov sites, official bodies
3. **Company or organisation website** — the organisation's own pages
4. **Official documentation** — developer portals, official docs
5. **Trusted news sources** — Reuters, AP, BBC, Bloomberg, Financial Times
6. **Community sources** — Wikipedia, forums, only when no better source exists

When two sources conflict: prefer the official source, briefly note the discrepancy, and express appropriate uncertainty rather than picking a side arbitrarily.

## Confidence & Accuracy — internal only
Before answering, silently assess confidence (never reveal or mention this score):
- **95–100%**: Answer immediately from knowledge.
- **70–94%**: Answer; note uncertainty only if it materially affects the answer.
- **Below 70%**: Rely on search results if available in context; say "I'm not certain" if they aren't.
- **Below 40%**: State honestly that you cannot verify — never fabricate to fill the gap.

## Conversation Focus
Every response should advance what the user is actually trying to accomplish. When the user changes subject, pivot completely — do not drag in the previous topic. Track the conversation goal and stay aligned with it throughout.

## Response Style — MANDATORY
- **Direct.** Answer immediately. No preamble.
- **Conversational by default.** Match the energy and register of the person you're talking to.
- **Length matches complexity.** One casual question = one or a few conversational sentences. Deep question = thorough but not bloated.
- **No openers.** Never start with "Great question!", "Certainly!", "Of course!", "Absolutely!", "Sure!", "Of course!" — go straight to the answer.
- **No closers.** Never end with "Let me know if you need anything else!", "I hope this helps!", "Feel free to ask!".
- **Markdown only when it genuinely helps** — code blocks for code, tables for comparisons, bullets for genuine lists. No headers on short answers.
- **Never expose your process.** Don't say "let me think about this", "searching for information", "based on my training", "as an AI", or anything that breaks the illusion of a fluid, knowledgeable conversation.
- Current date and time: ${new Date().toLocaleString("en-GB", { weekday:"long", year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit", timeZoneName:"short" })}.`;

const ENGAGERA_DEV_SYSTEM_PROMPT = `You are Engagera Dev, a world-class autonomous AI Product Engineering Agent.

MISSION: Transform ideas into production-ready software by combining research, software engineering, automation, database architecture, UI/UX best practices, testing, deployment workflows, and intelligent project management.

You are: Software Architect · Full Stack Developer · UI/UX Engineer · Backend Engineer · Database Engineer · DevOps Assistant · Code Reviewer · QA Engineer · Git Assistant · Product Engineer · Technical Research Assistant

Your software is always: Functional · Secure · Scalable · Responsive · Maintainable · Production-ready

## Identity & Ownership — Non-Negotiable
You were trained and built by **AfuAI**, the AI research and engineering division of **AfuChat Technologies Limited**.

Ownership chain: **AfuChat Technologies Limited** → **AfuAI** (AI division) → **Engagera** (this platform and API)

- If asked who trained you: "I was trained by the AfuAI team at AfuChat Technologies Limited."
- If asked who built you: "AfuAI, the AI division of AfuChat Technologies Limited."
- If asked what model powers the API: "This is a proprietary AfuAI model, developed and owned by AfuChat Technologies Limited."
- Developers accessing this via API are consumers of AfuAI's model — they did not train it, OpenAI did not train it, no third party trained it. AfuAI built it.
- NEVER claim to be ChatGPT, Claude, Gemini, Llama, or any other AI. NEVER attribute your training to OpenAI, Anthropic, Google, or Meta.

## Core Behaviour
- Understand requirements fully before writing code.
- Research best practices and official docs before major implementations.
- Plan before coding. Think several steps ahead. Consider edge cases and long-term maintenance.
- Build complete, production-quality solutions — never placeholders.
- Test your work and verify functionality.
- Explain important architectural decisions concisely.
- Never invent APIs or libraries. Prefer official documentation.

## What You Do
- **Full-stack development**: Frontend, backend, databases, auth, storage, APIs, validation, testing, documentation, configuration.
- **Database engineering**: Design schemas, generate migrations and CRUD, create indexes and RLS policies, optimise queries, normalise data.
- **Supabase**: Create tables/relationships, configure auth & storage, generate Edge Functions, write Row Level Security policies.
- **API development**: REST, GraphQL, realtime APIs with proper auth, validation, error handling, pagination, filtering, search, and docs.
- **UI/UX**: Responsive (mobile/tablet/desktop), accessible, dark/light mode, loading/empty/error states.
- **Security**: Never expose secrets. Guard against injection, XSS, CSRF. Use secure auth flows. Recommend best practices.
- **Testing**: Unit, integration, component, and API tests. Run linting, type checks, build verification.
- **Git**: Semantic commits (feat/fix/docs/refactor/test/perf/build/chore). Review before push.
- **Deployment**: Prepare and verify builds. Run health checks. Report status.
- **Code review**: Security, performance, scalability, maintainability, accessibility, best practices.

## Response Style
- Lead with code or a concrete plan — not lengthy preamble.
- Use markdown for code (always include the language tag), tables, and structured content.
- Match response length to complexity. Simple question → concise answer. Architecture question → structured plan with headers.
- No filler openers ("Great question!", "Certainly!", etc.). Go straight to the answer.
- For significant tasks: state the Plan → Actions → Files affected → Commands → Results → Issues → Recommendations.

## Self-Check (before every response)
Does it work? Is it secure? Is it responsive? Is it scalable? Is it maintainable? Are dependencies correct? Can this realistically ship? Improve if any answer is no.

Current date: ${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

const IMAGE_SYSTEM_PROMPT = `You are an expert SVG artist and UI designer. Respond with ONLY a single SVG code block  -  absolutely no text before or after, no explanations, no markdown prose, just the code block.

Rules:
- viewBox="0 0 400 400" width="400" height="400"
- For UI/interface requests (skeleton loaders, dashboards, cards, forms, buttons): draw realistic-looking UI mockups with rounded rectangles, appropriate colors (light grey #e5e7eb for skeleton, white #fff backgrounds, etc.), and subtle shadows
- For artwork/illustration requests: vivid colours, gradients, multiple shapes, depth
- Use <defs> for gradients, patterns, or clipPaths when they add quality
- SVG <animate> or <animateTransform> are allowed for loaders, spinners, or pulsing effects
- No <script> tags, no external image/font resources
- Keep total elements under 70 to stay within token budget
- Make it look polished and professional  -  not sparse

Respond EXACTLY in this format (absolutely nothing else before or after):
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <!-- content here -->
</svg>
\`\`\``;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-guest-session-id, x-engagera-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Robots.txt compliance cache (warm per Deno isolate) ──────────────────────
const _robotsCache = new Map<string, { allowed: boolean; ts: number }>();
const _ROBOTS_TTL  = 12 * 60 * 60_000; // 12 h per domain

// ── Source type ───────────────────────────────────────────────────────────────
interface Source {
  title:   string;
  url:     string;
  snippet: string;
  image?:  string;  // og:image or twitter:image extracted from the page
}

// ── Logging ───────────────────────────────────────────────────────────────────
function log(level: "info"|"warn"|"error", event: string, data: Record<string,unknown>) {
  const entry = JSON.stringify({ level, event, ts: new Date().toISOString(), ...data });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Message types ─────────────────────────────────────────────────────────────
type ContentPart    = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type MessageContent = string | ContentPart[];
interface IncomingMessage { role: string; content: MessageContent; }

function isValidMessage(m: unknown): m is IncomingMessage {
  if (!m || typeof m !== "object") return false;
  const msg = m as Record<string,unknown>;
  if (!["user","assistant","system"].includes(msg.role as string)) return false;
  return typeof msg.content === "string" || Array.isArray(msg.content);
}

function getTextPreview(content: MessageContent): string {
  if (typeof content === "string") return content;
  const tp = content.find((p): p is { type:"text"; text:string } => p.type === "text");
  return tp?.text ?? "";
}

// Generated images are stored (and shown to the user) as markdown with a
// full base64 data URI inline — sometimes 100KB+ of text. If that's resent
// verbatim as conversation history on every later turn, it blows the
// provider's context/token limits and every *subsequent* chat message in
// that conversation fails, even though the current message has nothing to
// do with images. Replace prior generated-image markup with a short marker
// before any message list is handed to an LLM provider — this must be
// called on every historical message's text right before it's placed into
// a provider-bound ChatMessage[].
const GENERATED_IMAGE_MARKDOWN_RE = /!\[[^\]]*\]\(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+\)/g;
const RAW_DATA_URI_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{200,}/g;

function sanitizeContentForModel(content: string): string {
  if (!content.includes("data:image")) return content;
  return content
    .replace(GENERATED_IMAGE_MARKDOWN_RE, "[An image was generated here earlier in this conversation]")
    .replace(RAW_DATA_URI_RE, "[image data omitted]");
}

interface ChatMessage {
  role: string;
  content: string | MessageContent | null;
}

interface AIResult {
  ok: boolean;
  content: string;
  inputTokens: number;
  outputTokens: number;
  provider?: string;
  model?: string;
  errorDetail?: string;
}

// ── OpenAI-compatible provider call (Groq, DeepSeek, OpenRouter) ──────────────
async function callOpenAICompat(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  requestId: string,
  providerName: string,
  extraHeaders?: Record<string,string>,
  timeoutMs = 11_000,
): Promise<AIResult> {
  const body = { model, messages, max_tokens: maxTokens };

  // Single attempt per provider — on 429/timeout, immediately try next provider.
  // Retrying the same provider wastes precious seconds from the global deadline.
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    log("warn", `${providerName}.network_error`, { requestId, error: String(err) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: String(err) };
  }

  if (!res || !res.ok) {
    const errText = await res?.text().catch(() => "") ?? "";
    log("warn", `${providerName}.http_error`, { requestId, status: res?.status, error: errText.slice(0,200) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: `HTTP ${res?.status ?? "unknown"}: ${errText.slice(0,100)}` };
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };

  if (data.error) {
    log("warn", `${providerName}.api_error`, { requestId, error: data.error.message });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: data.error.message };
  }

  const content     = data.choices?.[0]?.message?.content ?? "";
  const inputTokens  = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  if (!content) {
    log("warn", `${providerName}.empty_response`, { requestId });
    return { ok: false, content: "", inputTokens, outputTokens, errorDetail: "empty response" };
  }

  log("info", `${providerName}.success`, { requestId, model, inputTokens, outputTokens, len: content.length });
  return { ok: true, content, inputTokens, outputTokens, provider: providerName, model };
}


// ── OpenAI-compatible streaming generator ─────────────────────────────────────
async function* callOpenAICompatStream(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  requestId: string,
  providerName: string,
  extraHeaders?: Record<string, string>,
): AsyncGenerator<string> {
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, stream: true }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    log("warn", `${providerName}.stream_error`, { requestId, error: String(err) });
    return;
  }
  if (!res.ok || !res.body) {
    log("warn", `${providerName}.stream_http_error`, { requestId, status: res.status });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") return;
        try {
          const parsed = JSON.parse(raw);
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) yield chunk;
        } catch { /* skip malformed chunk */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Google Gemini call (different API format) ─────────────────────────────────
async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  requestId: string,
  timeoutMs = 11_000,
): Promise<AIResult> {
  // Separate system message from conversation turns
  const systemMsg  = messages.find((m) => m.role === "system");
  const turnMsgs   = messages.filter((m) => m.role !== "system");

  // Convert to Gemini format: role "assistant" → "model"
  const contents = turnMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : getTextPreview(m.content as MessageContent) }],
  }));

  const geminiBody: Record<string,unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  };
  if (systemMsg) {
    geminiBody.system_instruction = {
      parts: [{ text: typeof systemMsg.content === "string" ? systemMsg.content : "" }],
    };
  }

  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    log("warn", "gemini.network_error", { requestId, error: String(err) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: String(err) };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    log("warn", "gemini.http_error", { requestId, status: res.status, error: errText.slice(0,200) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: `HTTP ${res.status}` };
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    error?: { message?: string };
  };

  if (data.error) {
    log("warn", "gemini.api_error", { requestId, error: data.error.message });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: data.error.message };
  }

  const content      = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const inputTokens  = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

  if (!content) {
    log("warn", "gemini.empty_response", { requestId, finishReason: data.candidates?.[0]?.finishReason });
    return { ok: false, content: "", inputTokens, outputTokens, errorDetail: "empty response" };
  }

  log("info", "gemini.success", { requestId, model, inputTokens, outputTokens, len: content.length });
  return { ok: true, content, inputTokens, outputTokens, provider: "gemini", model };
}

// ── Cloudflare Workers AI call (own response shape, needs account ID) ─────────
async function callCloudflare(
  apiToken: string,
  accountId: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  requestId: string,
  timeoutMs = 8_000,
): Promise<AIResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : getTextPreview(m.content as MessageContent),
        })),
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    log("warn", "cloudflare.network_error", { requestId, error: String(err) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: String(err) };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    log("warn", "cloudflare.http_error", { requestId, status: res.status, error: errText.slice(0, 200) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: `HTTP ${res.status}: ${errText.slice(0,200)}` };
  }

  const data = await res.json() as {
    success?: boolean;
    result?: { response?: string };
    errors?: { message?: string }[];
  };

  if (!data.success) {
    const errMsg = data.errors?.map((e) => e.message).join("; ") ?? "unknown error";
    log("warn", "cloudflare.api_error", { requestId, error: errMsg });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: errMsg };
  }

  const content = data.result?.response ?? "";
  if (!content) {
    log("warn", "cloudflare.empty_response", { requestId });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: "empty response" };
  }

  log("info", "cloudflare.success", { requestId, model, len: content.length });
  return { ok: true, content, inputTokens: 0, outputTokens: 0, provider: "cloudflare", model };
}

// ── Cloudflare Workers AI raster image generation (Flux Schnell) ──────────────
// Free tier, no billing. Returns raw base64 JPEG bytes (Workers AI's image
// models respond with the binary image, not JSON — unlike callCloudflare()
// above which is for text models).
async function generateRasterImage(
  apiToken: string,
  accountId: string,
  prompt: string,
  requestId: string,
  timeoutMs = 20_000,
): Promise<{ ok: true; base64: string } | { ok: false; errorDetail: string }> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: prompt.slice(0, 2000) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    log("warn", "cloudflare_image.network_error", { requestId, error: String(err) });
    return { ok: false, errorDetail: String(err) };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    log("warn", "cloudflare_image.http_error", { requestId, status: res.status, error: errText.slice(0, 200) });
    return { ok: false, errorDetail: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
  }

  const data = await res.json() as { success?: boolean; result?: { image?: string }; errors?: { message?: string }[] };
  if (!data.success || !data.result?.image) {
    const errMsg = data.errors?.map((e) => e.message).join("; ") ?? "no image in response";
    log("warn", "cloudflare_image.api_error", { requestId, error: errMsg });
    return { ok: false, errorDetail: errMsg };
  }

  log("info", "cloudflare_image.success", { requestId, len: data.result.image.length });
  return { ok: true, base64: data.result.image };
}

// ── Multi-provider fallback call ──────────────────────────────────────────────
interface ProviderKeys {
  groq?:            string;
  deepseek?:        string;
  openrouter?:      string;
  openai?:          string;
  gemini?:          string;
  cloudflare?:      string;
  cloudflareAccountId?: string;
  cerebras?:        string;
}

async function callWithFallback(
  chain: ProviderModel[],
  keys: ProviderKeys,
  messages: ChatMessage[],
  maxTokens: number,
  requestId: string,
  globalDeadlineMs = 48_000,
): Promise<AIResult> {
  const errors: string[] = [];
  const deadline = Date.now() + globalDeadlineMs;

  for (const { provider, model } of chain) {
    // Stop trying if we're running out of time
    const remaining = deadline - Date.now();
    if (remaining < 3_000) {
      log("warn", "fallback.deadline_reached", { requestId, remaining });
      break;
    }

    const key = keys[provider];
    if (!key) {
      log("info", "provider.no_key", { requestId, provider, model });
      continue;
    }

    // Each provider call gets at most 8s — enough for fast models; 6 providers × 8s = 48s budget
    const perCallMs = Math.min(8_000, remaining - 2_000);

    let result: AIResult;

    if (provider === "groq") {
      result = await callOpenAICompat(GROQ_API_URL, key, model, messages, maxTokens, requestId, "groq", undefined, perCallMs);
    } else if (provider === "openai") {
      result = await callOpenAICompat(OPENAI_API_URL, key, model, messages, maxTokens, requestId, "openai", undefined, perCallMs);
    } else if (provider === "deepseek") {
      result = await callOpenAICompat(DEEPSEEK_API_URL, key, model, messages, maxTokens, requestId, "deepseek", undefined, perCallMs);
    } else if (provider === "openrouter") {
      result = await callOpenAICompat(OPENROUTER_API_URL, key, model, messages, maxTokens, requestId, "openrouter", {
        "HTTP-Referer": "https://engagera.afuchat.com",
        "X-Title": "Engagera",
      }, perCallMs);
    } else if (provider === "gemini") {
      result = await callGemini(key, model, messages, maxTokens, requestId, perCallMs);
    } else if (provider === "cloudflare") {
      if (!keys.cloudflareAccountId) {
        log("info", "provider.no_account_id", { requestId, provider, model });
        continue;
      }
      result = await callCloudflare(key, keys.cloudflareAccountId, model, messages, maxTokens, requestId, perCallMs);
    } else if (provider === "cerebras") {
      result = await callOpenAICompat(CEREBRAS_API_URL, key, model, messages, maxTokens, requestId, "cerebras", undefined, perCallMs);
    } else {
      continue;
    }

    if (result.ok) {
      log("info", "fallback.success", { requestId, provider, model });
      return result;
    }

    errors.push(`${provider}/${model}: ${result.errorDetail ?? "failed"}`);
    log("warn", "fallback.next", { requestId, failed: `${provider}/${model}`, reason: result.errorDetail });
  }

  log("error", "fallback.all_failed", { requestId, errors });
  return {
    ok: false, content: "",
    inputTokens: 0, outputTokens: 0,
    errorDetail: errors.join(" | "),
  };
}

// ── Web search: Brave (if key set) → DuckDuckGo fallback ──────────────────────
// Plain search-index lookups only — no "AI search" services (Tavily removed).
async function webSearch(
  query: string,
  braveKey?: string,
): Promise<{ text: string; sources: Source[] }> {
  // ── 1. Brave Search API (if key set) ───────────────────────────────────────
  if (braveKey) {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`;
      const res = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": braveKey,
        },
      });
      if (res.ok) {
        const data = await res.json() as {
          web?: { results?: { title:string; url:string; description:string; age?:string }[] };
        };
        const results = data.web?.results ?? [];
        if (results.length > 0) {
          const sources: Source[] = results.map((r) => ({
            title: r.title, url: r.url, snippet: r.description,
          }));
          const lines = results.map((r, i) =>
            `${i+1}. **${r.title}**${r.age ? ` (${r.age})` : ""}\n   ${r.description}\n   URL: ${r.url}`
          );
          return { text: `Search results for "${query}":\n\n${lines.join("\n\n")}`, sources };
        }
      }
    } catch { /* fall through to DuckDuckGo */ }
  }

  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(ddgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) return { text: `Search unavailable (HTTP ${res.status}). Try rephrasing.`, sources: [] };

    const html = await res.text();
    const results: Source[] = [];

    const titleRe   = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const titles:   { url:string; title:string }[] = [];
    const snippets: string[] = [];

    let m: RegExpExecArray | null;
    while ((m = titleRe.exec(html)) !== null && titles.length < 10) {
      let rawUrl = m[1];
      if (rawUrl.includes("uddg=")) {
        try { rawUrl = decodeURIComponent(rawUrl.split("uddg=")[1].split("&")[0]); } catch { /* ok */ }
      }
      const title = m[2].replace(/<[^>]*>/g, "").trim();
      if (title && rawUrl.startsWith("http")) titles.push({ url: rawUrl, title });
    }
    let s: RegExpExecArray | null;
    while ((s = snippetRe.exec(html)) !== null && snippets.length < 10) {
      snippets.push(s[1].replace(/<[^>]*>/g, "").trim());
    }
    for (let i = 0; i < Math.min(titles.length, snippets.length, 8); i++) {
      if (titles[i]?.title && snippets[i]) {
        results.push({ title: titles[i].title, url: titles[i].url, snippet: snippets[i] });
      }
    }

    if (results.length > 0) {
      const lines = results.map((r, i) =>
        `${i+1}. **${r.title}**\n   ${r.snippet}\n   URL: ${r.url}`
      );
      return { text: `Search results for "${query}":\n\n${lines.join("\n\n")}`, sources: results };
    }

    // Last resort: DuckDuckGo Instant Answer API
    const iaRes = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { "Accept": "application/json" } },
    );
    if (iaRes.ok) {
      const ia = await iaRes.json() as {
        AbstractText?: string; AbstractURL?: string;
        RelatedTopics?: { Text?:string; FirstURL?:string }[];
      };
      const parts: string[] = [];
      const sources: Source[] = [];
      if (ia.AbstractText) {
        parts.push(`${ia.AbstractText}\nSource: ${ia.AbstractURL ?? ""}`);
        if (ia.AbstractURL) sources.push({ title: query, url: ia.AbstractURL, snippet: ia.AbstractText });
      }
      (ia.RelatedTopics ?? []).slice(0, 5).forEach((t) => {
        if (t.Text) {
          parts.push(`• ${t.Text}${t.FirstURL ? `  URL: ${t.FirstURL}` : ""}`);
          if (t.FirstURL) sources.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text });
        }
      });
      if (parts.length > 0) return { text: `Results for "${query}":\n\n${parts.join("\n\n")}`, sources };
    }

    return { text: `No results found for "${query}". Try a different query.`, sources: [] };
  } catch (err) {
    return { text: `Search failed: ${String(err)}`, sources: [] };
  }
}

// ── JS-gate detector ──────────────────────────────────────────────────────────
// Returns true if the content is a blank/JS-gated shell that won't be useful.
function isJsGated(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.length < 120) return true; // suspiciously short
  const gatePatterns = [
    "enable javascript",
    "javascript is required",
    "javascript must be enabled",
    "requires javascript",
    "please enable js",
    "you need to enable javascript",
    "this app requires javascript",
    "loading…",
    "loading...",
  ];
  // if the whole stripped text is dominated by gate language
  if (gatePatterns.some((p) => t.includes(p) && t.length < 600)) return true;
  return false;
}

// ── AfuBot User-Agent ─────────────────────────────────────────────────────────
// Identifies AfuBot honestly to site operators (name + info URL), the way any
// legitimate crawler should — this is AfuChat Technologies' own bot, not a
// third-party service acting on our behalf.
const AFUBOT_UA = "AfuBot/1.0 (+https://engagera.afuchat.com/afubot; in-house web reader)";

// ── Manual fallback extractor ──────────────────────────────────────────────────
// Blunt tag-stripping used only when structured (DOM + Readability) extraction
// below fails or comes up short — e.g. malformed HTML Readability can't parse.
function stripHtmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  const pageTitle  = titleMatch ? titleMatch[1].trim() : "";
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return { title: pageTitle, text };
}

// ── Extract og:image / twitter:image from raw HTML ────────────────────────────
function extractOgImage(html: string, baseUrl: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m?.[1] && !m[1].startsWith("data:")) {
      try { return new URL(m[1], baseUrl).href; } catch { continue; }
    }
  }
  return null;
}

// ── AfuBot: AfuChat's own real-time web-reading engine ─────────────────────────
// Fetches pages with full browser-like headers to bypass bot-detection, then
// extracts content via DOM+Readability. Falls back to Jina.ai Reader for pages
// that render entirely via client-side JavaScript so we always return real content.
async function afuBotFetch(url: string): Promise<{ text: string; image: string | null; pageTitle: string | null }> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return { text: "Invalid URL — must start with http:// or https://", image: null, pageTitle: null };
  }

  const fail = (msg: string, image: string | null = null) => ({ text: msg, image, pageTitle: null });

  try {
    // Full browser-like headers to avoid bot-detection blocks
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "User-Agent":                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language":           "en-US,en;q=0.9",
        "Cache-Control":             "max-age=0",
        "Sec-Fetch-Dest":            "document",
        "Sec-Fetch-Mode":            "navigate",
        "Sec-Fetch-Site":            "none",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    if (!res.ok) return fail(`Could not fetch "${url}" (HTTP ${res.status}).`);

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(contentType) && contentType) {
      if (/text\/plain|application\/json/i.test(contentType)) {
        const raw = (await res.text()).trim();
        const limit = 6000;
        return { text: raw.length > limit ? raw.slice(0, limit) + `\n\n[Content truncated]` : raw, image: null, pageTitle: null };
      }
      return fail(`"${url}" is not a readable webpage (content-type: ${contentType.split(";")[0]}).`);
    }

    const html     = await res.text();
    const finalUrl = res.url || url;

    // Always extract og:image — present even on JS-heavy pages since it's for social crawlers
    const ogImage = extractOgImage(html, finalUrl);

    // ── 1. Structured extraction: real DOM + Readability scoring ──────────────
    try {
      const [{ DOMParser }, { Readability }] = await Promise.all([
        import("https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts"),
        import("https://esm.sh/@mozilla/readability@0.5.0?no-dts"),
      ]);
      const document = new DOMParser().parseFromString(html, "text/html");
      if (!document) throw new Error("DOM parse failed");
      // deno-lint-ignore no-explicit-any
      const article  = new Readability(document as any, { url: finalUrl } as any).parse();
      const bodyText = (article?.textContent ?? "").trim();
      if (bodyText.length > 200 && !isJsGated(bodyText)) {
        const heading  = article?.title ? `# ${article.title}\n\n` : "";
        const byline   = article?.byline ? `_${article.byline}_\n\n` : "";
        const content  = `${heading}${byline}${bodyText}`;
        const limit    = 8000;
        return {
          text:      content.length > limit ? content.slice(0, limit) + `\n\n[Page content continues — ${content.length - limit} more characters not shown]` : content,
          image:     ogImage,
          pageTitle: article?.title ?? null,
        };
      }
    } catch { /* fall through */ }

    // ── 2. Manual tag-stripping fallback ──────────────────────────────────────
    const { title: pageTitle, text } = stripHtmlToText(html);
    if (!isJsGated(text) && text.length > 200) {
      const content = pageTitle ? `# ${pageTitle}\n\n${text}` : text;
      const limit   = 6000;
      return {
        text:      content.length > limit ? content.slice(0, limit) + `\n\n[Content truncated — page has more text]` : content,
        image:     ogImage,
        pageTitle: pageTitle || null,
      };
    }

    // ── 3. JS-gated: try Jina.ai Reader (renders JS client-side, free) ────────
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
        signal:  AbortSignal.timeout(15_000),
        headers: { "Accept": "text/plain,text/markdown", "X-No-Cache": "true" },
      });
      if (jinaRes.ok) {
        const jinaText = (await jinaRes.text()).trim();
        if (jinaText.length > 200 && !isJsGated(jinaText)) {
          const limit = 8000;
          // Extract page title from Jina markdown (first # heading)
          const titleMatch = jinaText.match(/^#\s+(.+)/m);
          return {
            text:      jinaText.length > limit ? jinaText.slice(0, limit) + `\n\n[Content truncated]` : jinaText,
            image:     ogImage,
            pageTitle: titleMatch?.[1]?.trim() ?? pageTitle ?? null,
          };
        }
      }
    } catch { /* fall through */ }

    // ── 4. Still nothing — return og:image if we at least got that ────────────
    return {
      text:      `Could not read "${url}" — this page renders its content with client-side JavaScript. AfuBot read the page shell but found no article content.`,
      image:     ogImage,
      pageTitle: pageTitle || null,
    };

  } catch (err) {
    return fail(`Failed to fetch page: ${String(err)}`);
  }
}

// ── Robots.txt-aware crawler (used in search deep-crawl) ──────────────────────
async function isAllowedByRobots(rawUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(rawUrl);
    const host   = parsed.hostname;
    const cached = _robotsCache.get(host);
    if (cached && Date.now() - cached.ts < _ROBOTS_TTL) return cached.allowed;

    const robotsUrl = `${parsed.protocol}//${host}/robots.txt`;
    const res = await fetch(robotsUrl, {
      signal:  AbortSignal.timeout(3_000),
      headers: { "User-Agent": AFUBOT_UA },
    });

    if (!res.ok) {
      _robotsCache.set(host, { allowed: true, ts: Date.now() });
      return true;
    }

    const text  = await res.text();
    const path  = parsed.pathname;
    let inBlock = false;
    let allowed = true;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (/^user-agent\s*:/i.test(line)) {
        const agent = line.replace(/^user-agent\s*:\s*/i, "").toLowerCase();
        inBlock = agent === "*" || agent.includes("afubot");
      } else if (inBlock && /^disallow\s*:/i.test(line)) {
        const dp = line.replace(/^disallow\s*:\s*/i, "").trim();
        if (dp === "/" || (dp.length > 0 && path.startsWith(dp))) {
          allowed = false;
          break;
        }
      }
    }
    _robotsCache.set(host, { allowed, ts: Date.now() });
    return allowed;
  } catch {
    return true;
  }
}

// ── URL detector ──────────────────────────────────────────────────────────────
function detectURLs(text: string): string[] {
  // Match full URLs including subpaths, query strings, and fragments
  const urlRe = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const raw   = text.match(urlRe) ?? [];

  // Clean trailing punctuation that's likely not part of the URL — but don't
  // strip a trailing ')' if it balances an unmatched '(' earlier in the URL
  // (e.g. Wikipedia-style "https://en.wikipedia.org/wiki/Deno_(software)").
  const cleaned = raw.map((u) => {
    let v = u.replace(/[.,;:!?'"]+$/, "");
    while (v.endsWith(")")) {
      const opens  = (v.match(/\(/g) ?? []).length;
      const closes = (v.match(/\)/g) ?? []).length;
      if (closes > opens) v = v.slice(0, -1);
      else break;
    }
    return v;
  });

  // Ignore pure auth/redirect endpoints that have no readable content
  const ignored = /\/(share|tweet|intent|oauth|auth\/callback|redirect|logout)\b/i;

  return [...new Set(cleaned)]
    .filter((u) => !ignored.test(u))
    .filter((u) => {
      try { new URL(u); return true; } catch { return false; }
    })
    .slice(0, 5); // allow up to 5 URLs per message
}

// ── Weather tool (wttr.in — free, no key) ─────────────────────────────────────
function detectWeatherQuery(text: string): string | null {
  const t = text.toLowerCase();
  const patterns = [
    /weather\s+(?:in|for|at|of)\s+([a-z][a-z\s,]{1,48})(?:\?|$|\.)/i,
    /(?:what(?:'s| is)(?: the)?)\s+(?:weather|temperature|temp|forecast)\s+(?:in|for|at)\s+([a-z][a-z\s,]{1,48})(?:\?|$|\.)/i,
    /how(?:'s| is) (?:it|the weather)\s+(?:in|at)\s+([a-z][a-z\s,]{1,48})(?:\?|$|\.)/i,
    /(?:is it|will it)\s+(?:raining|hot|cold|sunny|cloudy)\s+(?:in|at)\s+([a-z][a-z\s,]{1,48})(?:\?|$|\.)/i,
    /([a-z][a-z\s]{1,30})\s+(?:weather|temperature|forecast)(?:\?|$|\.)/i,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m?.[1]) {
      const loc = m[1].trim().replace(/[.,?!]+$/, "");
      if (loc.length > 1 && !["my","the","your","this","that","what","how"].includes(loc)) return loc;
    }
  }
  if (/\b(?:weather|forecast)\b/i.test(t) && !/how does weather work|explain weather/i.test(t)) return "auto";
  return null;
}

async function fetchWeather(location: string, requestId: string): Promise<string | null> {
  try {
    const loc = location === "auto" ? "" : encodeURIComponent(location);
    const res = await fetch(`https://wttr.in/${loc}?format=j1`, {
      headers: { "User-Agent": AFUBOT_UA },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const d = await res.json() as {
      nearest_area?: [{ areaName: [{value:string}]; country: [{value:string}] }];
      current_condition?: [{
        temp_C: string; temp_F: string; weatherDesc: [{value:string}];
        humidity: string; windspeedKmph: string; FeelsLikeC: string; uvIndex: string; visibility: string;
      }];
      weather?: [{
        date: string; maxtempC: string; mintempC: string; maxtempF: string; mintempF: string;
        hourly?: { tempC: string; weatherDesc: [{value:string}]; time: string }[];
        astronomy?: [{ sunrise: string; sunset: string }];
      }];
    };
    const area  = d.nearest_area?.[0];
    const city  = area?.areaName?.[0]?.value ?? location;
    const ctry  = area?.country?.[0]?.value ?? "";
    const cur   = d.current_condition?.[0];
    if (!cur) return null;
    const desc  = cur.weatherDesc?.[0]?.value ?? "";
    const astro = d.weather?.[0]?.astronomy?.[0];
    const forecast = (d.weather ?? []).slice(0, 3).map((w) => {
      const dt  = new Date(w.date).toLocaleDateString("en-GB", { weekday:"short", month:"short", day:"numeric" });
      const mid = w.hourly?.[4]?.weatherDesc?.[0]?.value ?? "";
      return `  • ${dt}: ${w.maxtempC}°C / ${w.mintempC}°C (${w.maxtempF}°F / ${w.mintempF}°F) — ${mid}`;
    }).join("\n");
    return [
      `📍 **${city}${ctry ? ", " + ctry : ""}** — Live weather`,
      `🌡️ **${cur.temp_C}°C (${cur.temp_F}°F)** — ${desc}`,
      `💧 Humidity: ${cur.humidity}%  |  💨 Wind: ${cur.windspeedKmph} km/h  |  🌡 Feels like: ${cur.FeelsLikeC}°C`,
      `☀️ UV Index: ${cur.uvIndex}  |  👁 Visibility: ${cur.visibility} km`,
      astro ? `🌅 Sunrise: ${astro.sunrise}  |  🌇 Sunset: ${astro.sunset}` : "",
      forecast ? `\n**3-Day Forecast:**\n${forecast}` : "",
    ].filter(Boolean).join("\n");
  } catch (err) {
    log("warn", "weather.fetch_failed", { requestId, error: String(err) });
    return null;
  }
}

// ── Currency & crypto rates (Frankfurter ECB + Open ER — free, no key) ────────
interface CurrencyQuery { from: string; to: string; amount: number }

function detectCurrencyQuery(text: string): CurrencyQuery | null {
  const currMap: Record<string,string> = {
    dollar:"USD",dollars:"USD",usd:"USD",euro:"EUR",euros:"EUR",eur:"EUR",
    pound:"GBP",pounds:"GBP",gbp:"GBP",naira:"NGN",ngn:"NGN",
    shilling:"KES",kes:"KES",cedi:"GHS",ghs:"GHS",rand:"ZAR",zar:"ZAR",
    yen:"JPY",jpy:"JPY",yuan:"CNY",cny:"CNY",rupee:"INR",inr:"INR",
    real:"BRL",brl:"BRL",bitcoin:"BTC",btc:"BTC",ethereum:"ETH",eth:"ETH",
    franc:"CHF",chf:"CHF",krona:"SEK",sek:"SEK",peso:"MXN",mxn:"MXN",
    cad:"CAD",aud:"AUD",nzd:"NZD",sgd:"SGD",hkd:"HKD",
  };
  const norm = (s: string) => currMap[s.toLowerCase()] ?? s.toUpperCase().slice(0, 3);
  const tickers = Object.keys(currMap).filter(k => k.length <= 3).map(k => currMap[k]);
  const hasCurr = new RegExp(`\\b(${[...new Set(tickers)].join("|")})\\b`, "i").test(text);
  if (!hasCurr && !/\b(?:convert|exchange|rate|worth)\b/i.test(text)) return null;
  const p = [
    /(\d+(?:[.,]\d+)?)\s*([a-z]{3})\s+(?:to|in|into)\s+([a-z]{3})/i,
    /convert\s+(\d+(?:[.,]\d+)?)\s*([a-z]{3,20})\s+(?:to|into)\s+([a-z]{3,20})/i,
    /(\d+(?:[.,]\d+)?)\s*([a-z]{3,10})\s+(?:in|to|worth in)\s+([a-z]{3,10})/i,
    /([a-z]{3})\s+(?:to|vs\.?|against)\s+([a-z]{3})/i,
  ];
  for (const pat of p) {
    const m = text.match(pat);
    if (!m) continue;
    if (m.length >= 4) return { amount: parseFloat(m[1].replace(",", "")) || 1, from: norm(m[2]), to: norm(m[3]) };
    if (m.length >= 3) return { amount: 1, from: norm(m[1]), to: norm(m[2]) };
  }
  return null;
}

async function fetchCurrencyRate(q: CurrencyQuery, requestId: string): Promise<string | null> {
  try {
    const r1 = await fetch(`https://api.frankfurter.app/latest?from=${q.from}&to=${q.to}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (r1.ok) {
      const d = await r1.json() as { amount:number; base:string; date:string; rates:Record<string,number> };
      const rate = d.rates[q.to];
      if (rate) {
        const conv = (q.amount * rate).toLocaleString("en-US", { maximumFractionDigits: 4 });
        return `💱 **Currency Exchange** (ECB / Frankfurter, ${d.date})\n${q.amount} **${q.from}** = **${conv} ${q.to}**\nRate: 1 ${q.from} = ${rate} ${q.to}`;
      }
    }
  } catch { /* try next */ }
  try {
    const base = ["USD","EUR","GBP"].includes(q.from) ? q.from : "USD";
    const r2 = await fetch(`https://open.er-api.com/v6/latest/${base}`, { signal: AbortSignal.timeout(5_000) });
    if (r2.ok) {
      const d2 = await r2.json() as { rates:Record<string,number>; time_last_update_utc:string };
      const fromRate = d2.rates[q.from] ?? 1;
      const toRate   = d2.rates[q.to];
      if (toRate) {
        const rate = toRate / fromRate;
        const conv = (q.amount * rate).toLocaleString("en-US", { maximumFractionDigits: 4 });
        return `💱 **Currency Exchange** (Open ER, ${d2.time_last_update_utc.slice(0,16)})\n${q.amount} **${q.from}** = **${conv} ${q.to}**\nRate: 1 ${q.from} ≈ ${rate.toFixed(4)} ${q.to}`;
      }
    }
  } catch (err) {
    log("warn", "currency.fetch_failed", { requestId, error: String(err) });
  }
  return null;
}

// ── Movie recommendations (TMDB — real metadata, requires TMDB_API_KEY) ───────
const TMDB_GENRE_MAP: Record<string, number> = {
  action: 28, adventure: 12, animation: 16, animated: 16, comedy: 35, funny: 35,
  crime: 80, documentary: 99, drama: 18, family: 10751, kids: 10751,
  fantasy: 14, history: 36, historical: 36, horror: 27, scary: 27, spooky: 27,
  music: 10402, musical: 10402, mystery: 9648, romance: 10749, romantic: 10749,
  "sci-fi": 878, scifi: 878, "science fiction": 878, thriller: 53,
  war: 10752, western: 37, superhero: 28,
};
const TMDB_MOOD_MAP: Record<string, number[]> = {
  sad: [18], "feel-good": [35, 10751], "feel good": [35, 10751], happy: [35, 10751],
  laugh: [35], cry: [18], scared: [27], "on the edge": [53, 27], relax: [35, 16],
  chill: [35, 16], intense: [53, 80], inspiring: [18, 36], nostalgic: [10751, 16],
};

interface MovieQuery { genreIds: number[]; similarTo?: string; yearFrom?: number; yearTo?: number; raw: string }

function detectMovieQuery(text: string): MovieQuery | null {
  const t = text.toLowerCase();
  const mentionsMovie = /\b(movies?|films?|flicks?|to watch|watch tonight|watch this weekend)\b/i.test(t);
  const asksForSuggestion = /\b(recommend(ations?)?|suggest(ions?)?|what should i watch|any good|looking for|feel like watching|in the mood for|something to watch|good (movie|film)s?|based on (my|your knowledge of my)\b.*(interests?|preferences?))\b/i.test(t);
  if (!mentionsMovie && !asksForSuggestion) return null;
  if (!mentionsMovie && !/\bwatch\b/i.test(t)) return null;

  const genreIds = new Set<number>();
  for (const [kw, id] of Object.entries(TMDB_GENRE_MAP)) {
    if (new RegExp(`\\b${kw.replace(/[- ]/g, "[- ]")}\\b`, "i").test(t)) genreIds.add(id);
  }
  for (const [kw, ids] of Object.entries(TMDB_MOOD_MAP)) {
    if (t.includes(kw)) ids.forEach((id) => genreIds.add(id));
  }

  // "similar to <title>" / "like <title>"
  let similarTo: string | undefined;
  const simMatch = t.match(/(?:similar to|like|in the style of)\s+["“]?([a-z0-9][a-z0-9 :'!.,-]{1,60}?)["”]?(?:\?|$|\.|,| but| movie| film)/i);
  if (simMatch?.[1]) similarTo = simMatch[1].trim();

  // Decade / year hints
  let yearFrom: number | undefined, yearTo: number | undefined;
  const decadeMatch = t.match(/\b(19|20)(\d0)s\b/);
  if (decadeMatch) {
    const start = parseInt(`${decadeMatch[1]}${decadeMatch[2]}`, 10);
    yearFrom = start; yearTo = start + 9;
  }
  const yearMatch = t.match(/\b(19|20)\d{2}\b/);
  if (!decadeMatch && yearMatch) { yearFrom = parseInt(yearMatch[0], 10); yearTo = yearFrom; }

  return { genreIds: [...genreIds], similarTo, yearFrom, yearTo, raw: text };
}

interface MovieResult { title: string; year: string; rating: number; overview: string; cdnUrl: string | null; dataUri: string | null; tmdbUrl: string }

async function fetchMovieRecommendations(q: MovieQuery, apiKey: string, requestId: string): Promise<MovieResult[] | null> {
  const TMDB_BASE = "https://api.themoviedb.org/3";
  const IMG_BASE  = "https://image.tmdb.org/t/p/w185";
  try {
    // deno-lint-ignore no-explicit-any
    let candidates: any[] = [];

    if (q.similarTo) {
      const searchRes = await fetch(
        `${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(q.similarTo)}`,
        { signal: AbortSignal.timeout(6_000) },
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const match = searchData.results?.[0];
        if (match) {
          const recRes = await fetch(
            `${TMDB_BASE}/movie/${match.id}/recommendations?api_key=${apiKey}&page=1`,
            { signal: AbortSignal.timeout(6_000) },
          );
          if (recRes.ok) {
            const recData = await recRes.json();
            candidates = recData.results ?? [];
          }
        }
      }
    }

    if (candidates.length === 0) {
      const params = new URLSearchParams({
        api_key: apiKey,
        sort_by: "popularity.desc",
        "vote_count.gte": "150",
        include_adult: "false",
        language: "en-US",
      });
      if (q.genreIds.length > 0) params.set("with_genres", q.genreIds.join(","));
      if (q.yearFrom) params.set("primary_release_date.gte", `${q.yearFrom}-01-01`);
      if (q.yearTo)   params.set("primary_release_date.lte", `${q.yearTo}-12-31`);
      const discRes = await fetch(`${TMDB_BASE}/discover/movie?${params.toString()}`, { signal: AbortSignal.timeout(6_000) });
      if (!discRes.ok) { log("warn", "movies.discover_failed", { requestId, status: discRes.status }); return null; }
      const discData = await discRes.json();
      candidates = discData.results ?? [];
    }

    if (candidates.length === 0) return null;

    const picked = candidates.slice(0, 6);

    // Inline posters as base64 data URIs (same pattern used for AI-generated
    // images) so they render reliably in the chat client regardless of
    // whether the user's network/device can reach image.tmdb.org directly.
    // A poster that fails to fetch just falls back to no image — never a
    // broken/dead <img> tag in the final message.
    // NOTE: the data URI is swapped in AFTER the model call (see
    // formatMovieBlock/agenticChat) — it is never sent to the LLM itself,
    // since base64 image bytes add nothing for a text model and would blow
    // out the request's context size.
    const posterDataUris = await Promise.allSettled(
      picked.map((m) => (m.poster_path ? posterToDataUri(`${IMG_BASE}${m.poster_path}`, requestId) : Promise.resolve(null))),
    );

    return picked.map((m, i) => ({
      title: m.title ?? m.original_title ?? "Untitled",
      year: (m.release_date ?? "").slice(0, 4) || "N/A",
      rating: Math.round((m.vote_average ?? 0) * 10) / 10,
      overview: (m.overview ?? "").slice(0, 220),
      cdnUrl: m.poster_path ? `${IMG_BASE}${m.poster_path}` : null,
      dataUri: posterDataUris[i].status === "fulfilled" ? (posterDataUris[i] as PromiseFulfilledResult<string | null>).value : null,
      tmdbUrl: `https://www.themoviedb.org/movie/${m.id}`,
    }));
  } catch (err) {
    log("warn", "movies.fetch_failed", { requestId, error: String(err) });
    return null;
  }
}

/** Fetch a TMDB poster and inline it as a base64 data URI so the chat client
 * never depends on reaching image.tmdb.org over the user's own network.
 * Fails open (returns null) on any error — the movie card just renders
 * without a poster rather than a broken image. */
async function posterToDataUri(url: string, requestId: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 400_000) return null; // sanity bound
    let binary = "";
    const chunk = 8192;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch (err) {
    log("warn", "movies.poster_fetch_failed", { requestId, url, error: String(err) });
    return null;
  }
}

function formatMovieBlock(movies: MovieResult[]): string {
  // Use the short TMDB CDN URL here (not the base64 data URI) — this text
  // block goes straight into the model's context, and a handful of ~200KB
  // base64 images would blow out the request size / token budget. The CDN
  // URL gets swapped for the reliable data URI after the model responds
  // (see the movie-tool call site in agenticChat).
  const lines = movies.map((m, i) => {
    const poster = m.cdnUrl ? `![${m.title} poster](${m.cdnUrl})\n` : "";
    return `${i + 1}. ${poster}**${m.title}** (${m.year}) — Rating ${m.rating}/10\n${m.overview || "No synopsis available."}\n[More on TMDB](${m.tmdbUrl})`;
  }).join("\n\n");
  return [
    "",
    "---",
    `🎬 **Live movie data from TMDB** (The Movie Database, retrieved just now):`,
    "",
    lines,
    "",
    "---",
    "",
    "INSTRUCTIONS: Recommend 3-5 of the movies above that best fit what the user asked for. " +
    "Use the exact titles, years, and ratings given — do not invent or alter any metadata. " +
    "Keep each recommendation's poster markdown image exactly as given so it renders. " +
    "Write a short, natural one-or-two-sentence reason per pick tailored to the user's request; you may lightly paraphrase the overview but don't contradict it. " +
    "If none of the movies above truly fit, say so honestly rather than forcing a match.",
  ].join("\n");
}

// ── Cross-session user context loader ────────────────────────────────────────
async function loadUserContext(
  db: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  try {
    const [memResult, convResult] = await Promise.allSettled([
      db.from("engagera_user_memory")
        .select("key, value, strength")
        .eq("user_id", userId)
        .order("strength", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(12),
      db.from("engagera_conversations")
        .select("title, model, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(8),
    ]);

    const parts: string[] = [];

    if (memResult.status === "fulfilled" && !memResult.value.error) {
      const mems = (memResult.value.data ?? []) as { key: string; value: string; strength: number }[];
      if (mems.length > 0) {
        const lines = mems
          .filter((m) => m.value && m.strength >= 2)
          .map((m) => `• [${m.key}] ${m.value}`);
        if (lines.length > 0) {
          parts.push(`**What I know about you from our past conversations:**\n${lines.join("\n")}`);
        }
      }
    }

    if (convResult.status === "fulfilled" && !convResult.value.error) {
      const convs = (convResult.value.data ?? []) as { title: string; model: string; updated_at: string }[];
      if (convs.length > 0) {
        const now = Date.now();
        const lines = convs.map((c) => {
          const daysAgo = Math.floor((now - new Date(c.updated_at).getTime()) / 86_400_000);
          const when = daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo}d ago`;
          return `• "${c.title}" (${when})`;
        });
        parts.push(`**Your recent conversations:**\n${lines.join("\n")}`);
      }
    }

    if (parts.length === 0) return "";
    return `\n\n---\n[Long-term Memory & Context  -  injected from your history]\n${parts.join("\n\n")}\n---`;
  } catch {
    return "";
  }
}

// ── Memory extractor: learn from every conversation (fire-and-forget) ─────────
async function extractAndSaveMemory(
  db: ReturnType<typeof createClient>,
  userId: string,
  userMessage: string,
  assistantReply: string,
  keys: ProviderKeys,
  requestId: string,
): Promise<void> {
  // Only process substantive messages
  if (!userMessage || userMessage.length < 15 || !assistantReply) return;

  try {
    const extractMsgs: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a memory extraction system. Given a user message and assistant reply, extract ONLY durable facts about the USER (not the assistant). Return a raw JSON array  -  no markdown, no explanation. Each item: {\"key\":\"preference|fact|skill|goal|context\",\"value\":\"brief fact about the user (max 100 chars)\",\"strength\":2-5}. strength: 5=core identity/profession, 4=major preference, 3=useful context, 2=minor detail. Only extract strength≥3 facts. If nothing notable, return []. Keep value concise.",
      },
      {
        role: "user",
        content: `User said: "${userMessage.slice(0, 400)}"\nAssistant: "${assistantReply.slice(0, 200)}"\n\nExtract user facts:`,
      },
    ];

    const result = await callWithFallback(STANDARD_CHAIN, keys, extractMsgs, 300, requestId + "_mem");
    if (!result.ok || !result.content.trim()) return;

    let facts: { key: string; value: string; strength: number }[] = [];
    try {
      const raw = result.content.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      facts = parsed;
    } catch {
      return;
    }

    for (const fact of facts.slice(0, 4)) {
      if (!fact.value || typeof fact.value !== "string") continue;
      const value    = fact.value.trim().slice(0, 150);
      const key      = ["preference", "fact", "skill", "goal", "context"].includes(fact.key) ? fact.key : "fact";
      const strength = Math.max(2, Math.min(5, Math.round(Number(fact.strength)) || 3));
      if (strength < 3) continue;

      try {
        // Check for close duplicate (same first 40 chars)
        const { data: existing } = await db
          .from("engagera_user_memory")
          .select("id, strength")
          .eq("user_id", userId)
          .ilike("value", `${value.slice(0, 40)}%`)
          .limit(1);

        if (existing && existing.length > 0) {
          const better = Math.max(existing[0].strength, strength);
          await db.from("engagera_user_memory")
            .update({ strength: better, updated_at: new Date().toISOString() })
            .eq("id", existing[0].id);
        } else {
          await db.from("engagera_user_memory").insert({
            user_id: userId, key, value, strength,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        }
      } catch { /* non-fatal */ }
    }
  } catch { /* non-fatal */ }
}

// ── Cross-user shared knowledge base ─────────────────────────────────────────
// Facts learned from ANY user are cached and shared with ALL users.
// TTLs → price: 12 h · volatile (CEOs, leaders): 7 d · general: 3 d · stable (founders, capitals): 30 d
type KbCategory = "stable" | "volatile" | "price" | "general";

function classifyKbQuery(query: string): KbCategory {
  const q = query.toLowerCase();
  if (/\b(price|cost|\$|stock\s+price|market\s+cap|exchange\s+rate|fee|usd|eur|gbp|crypto)\b/.test(q)) return "price";
  if (/\b(ceo|chief\s+executive|president|prime\s+minister|chancellor|who\s+leads|who\s+runs|current\s+leader|current\s+director|chairman)\b/.test(q)) return "volatile";
  if (/\b(founder|founded|established|created|born|died|history|capital\s+of|who\s+invented|who\s+discovered|origin|when\s+was)\b/.test(q)) return "stable";
  return "general";
}

function kbTtlMs(cat: KbCategory): number {
  const ttls: Record<KbCategory, number> = {
    price:    12 * 3_600_000,
    volatile:  7 * 86_400_000,
    general:   3 * 86_400_000,
    stable:   30 * 86_400_000,
  };
  return ttls[cat];
}

function normalizeKbKey(query: string): string {
  return query.toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(please|could|can|would|kindly|find|search|tell|show|what|who|how|the|a|an|of|in|on|at|to|for|and|or|but|is|are|was|were)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

async function lookupKB(
  db: ReturnType<typeof createClient>,
  key: string,
): Promise<{ searchText: string; sources: Source[] } | null> {
  if (!key || key.length < 6) return null;
  try {
    const { data } = await db
      .from("engagera_knowledge_base")
      .select("search_text, sources, expires_at, hit_count")
      .eq("topic_key", key)
      .maybeSingle();
    if (!data) return null;
    if (data.expires_at && new Date(data.expires_at as string) < new Date()) return null; // expired
    // Bump hit count async (fire-and-forget)
    db.from("engagera_knowledge_base")
      .update({ hit_count: ((data.hit_count as number) ?? 0) + 1 })
      .eq("topic_key", key)
      .then(() => {}).catch(() => {});
    return {
      searchText: data.search_text as string,
      sources:    (data.sources ?? []) as Source[],
    };
  } catch { return null; }
}

async function saveToKB(
  db: ReturnType<typeof createClient>,
  topicKey: string,
  question: string,
  searchText: string,
  sources: Source[],
  category: KbCategory,
): Promise<void> {
  if (!topicKey || topicKey.length < 6) return;
  try {
    const expiresAt = new Date(Date.now() + kbTtlMs(category)).toISOString();
    await db.from("engagera_knowledge_base").upsert({
      topic_key:   topicKey,
      question:    question.slice(0, 400),
      search_text: searchText.slice(0, 6000),
      sources:     sources.slice(0, 8),
      category,
      expires_at:  expiresAt,
      updated_at:  new Date().toISOString(),
    }, { onConflict: "topic_key" });
  } catch { /* non-fatal */ }
}

// ── Timezone map + time query detection ──────────────────────────────────────
const TIMEZONE_MAP: Record<string, { ianaZone: string; label: string }> = {
  // Russia
  "russia": { ianaZone: "Europe/Moscow", label: "Moscow, Russia" },
  "moscow": { ianaZone: "Europe/Moscow", label: "Moscow, Russia" },
  "saint petersburg": { ianaZone: "Europe/Moscow", label: "Saint Petersburg, Russia" },
  "st petersburg": { ianaZone: "Europe/Moscow", label: "St. Petersburg, Russia" },
  "novosibirsk": { ianaZone: "Asia/Novosibirsk", label: "Novosibirsk, Russia" },
  "vladivostok": { ianaZone: "Asia/Vladivostok", label: "Vladivostok, Russia" },
  "yekaterinburg": { ianaZone: "Asia/Yekaterinburg", label: "Yekaterinburg, Russia" },
  // USA
  "new york": { ianaZone: "America/New_York", label: "New York, USA" },
  "los angeles": { ianaZone: "America/Los_Angeles", label: "Los Angeles, USA" },
  "chicago": { ianaZone: "America/Chicago", label: "Chicago, USA" },
  "denver": { ianaZone: "America/Denver", label: "Denver, USA" },
  "california": { ianaZone: "America/Los_Angeles", label: "California, USA" },
  "usa": { ianaZone: "America/New_York", label: "Eastern USA" },
  "america": { ianaZone: "America/New_York", label: "Eastern USA" },
  // UK / Europe
  "london": { ianaZone: "Europe/London", label: "London, UK" },
  "uk": { ianaZone: "Europe/London", label: "United Kingdom" },
  "england": { ianaZone: "Europe/London", label: "England, UK" },
  "paris": { ianaZone: "Europe/Paris", label: "Paris, France" },
  "france": { ianaZone: "Europe/Paris", label: "France" },
  "berlin": { ianaZone: "Europe/Berlin", label: "Berlin, Germany" },
  "germany": { ianaZone: "Europe/Berlin", label: "Germany" },
  "rome": { ianaZone: "Europe/Rome", label: "Rome, Italy" },
  "italy": { ianaZone: "Europe/Rome", label: "Italy" },
  "madrid": { ianaZone: "Europe/Madrid", label: "Madrid, Spain" },
  "spain": { ianaZone: "Europe/Madrid", label: "Spain" },
  "amsterdam": { ianaZone: "Europe/Amsterdam", label: "Amsterdam, Netherlands" },
  "stockholm": { ianaZone: "Europe/Stockholm", label: "Stockholm, Sweden" },
  "oslo": { ianaZone: "Europe/Oslo", label: "Oslo, Norway" },
  "helsinki": { ianaZone: "Europe/Helsinki", label: "Helsinki, Finland" },
  "warsaw": { ianaZone: "Europe/Warsaw", label: "Warsaw, Poland" },
  "athens": { ianaZone: "Europe/Athens", label: "Athens, Greece" },
  // Asia
  "tokyo": { ianaZone: "Asia/Tokyo", label: "Tokyo, Japan" },
  "japan": { ianaZone: "Asia/Tokyo", label: "Japan" },
  "beijing": { ianaZone: "Asia/Shanghai", label: "Beijing, China" },
  "shanghai": { ianaZone: "Asia/Shanghai", label: "Shanghai, China" },
  "china": { ianaZone: "Asia/Shanghai", label: "China" },
  "seoul": { ianaZone: "Asia/Seoul", label: "Seoul, South Korea" },
  "korea": { ianaZone: "Asia/Seoul", label: "South Korea" },
  "singapore": { ianaZone: "Asia/Singapore", label: "Singapore" },
  "hong kong": { ianaZone: "Asia/Hong_Kong", label: "Hong Kong" },
  "dubai": { ianaZone: "Asia/Dubai", label: "Dubai, UAE" },
  "uae": { ianaZone: "Asia/Dubai", label: "United Arab Emirates" },
  "mumbai": { ianaZone: "Asia/Kolkata", label: "Mumbai, India" },
  "india": { ianaZone: "Asia/Kolkata", label: "India (IST)" },
  "delhi": { ianaZone: "Asia/Kolkata", label: "New Delhi, India" },
  "kolkata": { ianaZone: "Asia/Kolkata", label: "Kolkata, India" },
  "karachi": { ianaZone: "Asia/Karachi", label: "Karachi, Pakistan" },
  "pakistan": { ianaZone: "Asia/Karachi", label: "Pakistan" },
  "dhaka": { ianaZone: "Asia/Dhaka", label: "Dhaka, Bangladesh" },
  "bangkok": { ianaZone: "Asia/Bangkok", label: "Bangkok, Thailand" },
  "thailand": { ianaZone: "Asia/Bangkok", label: "Thailand" },
  "jakarta": { ianaZone: "Asia/Jakarta", label: "Jakarta, Indonesia" },
  "kuala lumpur": { ianaZone: "Asia/Kuala_Lumpur", label: "Kuala Lumpur, Malaysia" },
  "malaysia": { ianaZone: "Asia/Kuala_Lumpur", label: "Malaysia" },
  "riyadh": { ianaZone: "Asia/Riyadh", label: "Riyadh, Saudi Arabia" },
  "saudi arabia": { ianaZone: "Asia/Riyadh", label: "Saudi Arabia" },
  "tehran": { ianaZone: "Asia/Tehran", label: "Tehran, Iran" },
  "istanbul": { ianaZone: "Europe/Istanbul", label: "Istanbul, Turkey" },
  "turkey": { ianaZone: "Europe/Istanbul", label: "Turkey" },
  // Africa
  "cairo": { ianaZone: "Africa/Cairo", label: "Cairo, Egypt" },
  "egypt": { ianaZone: "Africa/Cairo", label: "Egypt" },
  "nairobi": { ianaZone: "Africa/Nairobi", label: "Nairobi, Kenya" },
  "kenya": { ianaZone: "Africa/Nairobi", label: "Kenya" },
  "lagos": { ianaZone: "Africa/Lagos", label: "Lagos, Nigeria" },
  "nigeria": { ianaZone: "Africa/Lagos", label: "Nigeria" },
  "johannesburg": { ianaZone: "Africa/Johannesburg", label: "Johannesburg, South Africa" },
  "cape town": { ianaZone: "Africa/Johannesburg", label: "Cape Town, South Africa" },
  "south africa": { ianaZone: "Africa/Johannesburg", label: "South Africa" },
  "accra": { ianaZone: "Africa/Accra", label: "Accra, Ghana" },
  "ghana": { ianaZone: "Africa/Accra", label: "Ghana" },
  "addis ababa": { ianaZone: "Africa/Addis_Ababa", label: "Addis Ababa, Ethiopia" },
  "ethiopia": { ianaZone: "Africa/Addis_Ababa", label: "Ethiopia" },
  "dar es salaam": { ianaZone: "Africa/Dar_es_Salaam", label: "Dar es Salaam, Tanzania" },
  "tanzania": { ianaZone: "Africa/Dar_es_Salaam", label: "Tanzania" },
  "abuja": { ianaZone: "Africa/Lagos", label: "Abuja, Nigeria" },
  "dakar": { ianaZone: "Africa/Dakar", label: "Dakar, Senegal" },
  "senegal": { ianaZone: "Africa/Dakar", label: "Senegal" },
  "casablanca": { ianaZone: "Africa/Casablanca", label: "Casablanca, Morocco" },
  "morocco": { ianaZone: "Africa/Casablanca", label: "Morocco" },
  // Australia / NZ
  "sydney": { ianaZone: "Australia/Sydney", label: "Sydney, Australia" },
  "melbourne": { ianaZone: "Australia/Melbourne", label: "Melbourne, Australia" },
  "australia": { ianaZone: "Australia/Sydney", label: "Australia (AEST)" },
  "auckland": { ianaZone: "Pacific/Auckland", label: "Auckland, New Zealand" },
  "new zealand": { ianaZone: "Pacific/Auckland", label: "New Zealand" },
  // Americas
  "toronto": { ianaZone: "America/Toronto", label: "Toronto, Canada" },
  "canada": { ianaZone: "America/Toronto", label: "Canada (Eastern)" },
  "vancouver": { ianaZone: "America/Vancouver", label: "Vancouver, Canada" },
  "mexico city": { ianaZone: "America/Mexico_City", label: "Mexico City, Mexico" },
  "mexico": { ianaZone: "America/Mexico_City", label: "Mexico" },
  "sao paulo": { ianaZone: "America/Sao_Paulo", label: "São Paulo, Brazil" },
  "brazil": { ianaZone: "America/Sao_Paulo", label: "Brazil (BRT)" },
  "buenos aires": { ianaZone: "America/Argentina/Buenos_Aires", label: "Buenos Aires, Argentina" },
  "argentina": { ianaZone: "America/Argentina/Buenos_Aires", label: "Argentina" },
  // Global
  "utc": { ianaZone: "UTC", label: "UTC / Coordinated Universal Time" },
  "gmt": { ianaZone: "UTC", label: "GMT / Greenwich Mean Time" },

  // ── Additional countries (full world coverage, added 2026-07-11) ──────────
  // East / Central Africa
  "uganda": { ianaZone: "Africa/Kampala", label: "Uganda" },
  "kampala": { ianaZone: "Africa/Kampala", label: "Kampala, Uganda" },
  "rwanda": { ianaZone: "Africa/Kigali", label: "Rwanda" },
  "kigali": { ianaZone: "Africa/Kigali", label: "Kigali, Rwanda" },
  "burundi": { ianaZone: "Africa/Bujumbura", label: "Burundi" },
  "south sudan": { ianaZone: "Africa/Juba", label: "South Sudan" },
  "sudan": { ianaZone: "Africa/Khartoum", label: "Sudan" },
  "somalia": { ianaZone: "Africa/Mogadishu", label: "Somalia" },
  "djibouti": { ianaZone: "Africa/Djibouti", label: "Djibouti" },
  "eritrea": { ianaZone: "Africa/Asmara", label: "Eritrea" },
  "dr congo": { ianaZone: "Africa/Kinshasa", label: "DR Congo" },
  "democratic republic of congo": { ianaZone: "Africa/Kinshasa", label: "DR Congo" },
  "congo": { ianaZone: "Africa/Brazzaville", label: "Republic of the Congo" },
  "malawi": { ianaZone: "Africa/Blantyre", label: "Malawi" },
  "zambia": { ianaZone: "Africa/Lusaka", label: "Zambia" },
  "zimbabwe": { ianaZone: "Africa/Harare", label: "Zimbabwe" },
  "mozambique": { ianaZone: "Africa/Maputo", label: "Mozambique" },
  "madagascar": { ianaZone: "Indian/Antananarivo", label: "Madagascar" },
  "mauritius": { ianaZone: "Indian/Mauritius", label: "Mauritius" },
  "seychelles": { ianaZone: "Indian/Mahe", label: "Seychelles" },
  "comoros": { ianaZone: "Indian/Comoro", label: "Comoros" },
  // Southern Africa
  "botswana": { ianaZone: "Africa/Gaborone", label: "Botswana" },
  "namibia": { ianaZone: "Africa/Windhoek", label: "Namibia" },
  "lesotho": { ianaZone: "Africa/Maseru", label: "Lesotho" },
  "eswatini": { ianaZone: "Africa/Mbabane", label: "Eswatini" },
  "swaziland": { ianaZone: "Africa/Mbabane", label: "Eswatini" },
  "angola": { ianaZone: "Africa/Luanda", label: "Angola" },
  // West Africa
  "cameroon": { ianaZone: "Africa/Douala", label: "Cameroon" },
  "ivory coast": { ianaZone: "Africa/Abidjan", label: "Ivory Coast" },
  "cote d'ivoire": { ianaZone: "Africa/Abidjan", label: "Ivory Coast" },
  "mali": { ianaZone: "Africa/Bamako", label: "Mali" },
  "niger": { ianaZone: "Africa/Niamey", label: "Niger" },
  "chad": { ianaZone: "Africa/Ndjamena", label: "Chad" },
  "benin": { ianaZone: "Africa/Porto-Novo", label: "Benin" },
  "togo": { ianaZone: "Africa/Lome", label: "Togo" },
  "burkina faso": { ianaZone: "Africa/Ouagadougou", label: "Burkina Faso" },
  "guinea": { ianaZone: "Africa/Conakry", label: "Guinea" },
  "sierra leone": { ianaZone: "Africa/Freetown", label: "Sierra Leone" },
  "liberia": { ianaZone: "Africa/Monrovia", label: "Liberia" },
  "gambia": { ianaZone: "Africa/Banjul", label: "Gambia" },
  "mauritania": { ianaZone: "Africa/Nouakchott", label: "Mauritania" },
  "guinea-bissau": { ianaZone: "Africa/Bissau", label: "Guinea-Bissau" },
  "cape verde": { ianaZone: "Atlantic/Cape_Verde", label: "Cape Verde" },
  "gabon": { ianaZone: "Africa/Libreville", label: "Gabon" },
  "equatorial guinea": { ianaZone: "Africa/Malabo", label: "Equatorial Guinea" },
  // North Africa
  "libya": { ianaZone: "Africa/Tripoli", label: "Libya" },
  "tunisia": { ianaZone: "Africa/Tunis", label: "Tunisia" },
  "algeria": { ianaZone: "Africa/Algiers", label: "Algeria" },
  // Europe
  "portugal": { ianaZone: "Europe/Lisbon", label: "Portugal" },
  "lisbon": { ianaZone: "Europe/Lisbon", label: "Lisbon, Portugal" },
  "ireland": { ianaZone: "Europe/Dublin", label: "Ireland" },
  "dublin": { ianaZone: "Europe/Dublin", label: "Dublin, Ireland" },
  "belgium": { ianaZone: "Europe/Brussels", label: "Belgium" },
  "switzerland": { ianaZone: "Europe/Zurich", label: "Switzerland" },
  "austria": { ianaZone: "Europe/Vienna", label: "Austria" },
  "vienna": { ianaZone: "Europe/Vienna", label: "Vienna, Austria" },
  "denmark": { ianaZone: "Europe/Copenhagen", label: "Denmark" },
  "iceland": { ianaZone: "Atlantic/Reykjavik", label: "Iceland" },
  "czech republic": { ianaZone: "Europe/Prague", label: "Czech Republic" },
  "czechia": { ianaZone: "Europe/Prague", label: "Czech Republic" },
  "slovakia": { ianaZone: "Europe/Bratislava", label: "Slovakia" },
  "hungary": { ianaZone: "Europe/Budapest", label: "Hungary" },
  "romania": { ianaZone: "Europe/Bucharest", label: "Romania" },
  "bulgaria": { ianaZone: "Europe/Sofia", label: "Bulgaria" },
  "ukraine": { ianaZone: "Europe/Kyiv", label: "Ukraine" },
  "kyiv": { ianaZone: "Europe/Kyiv", label: "Kyiv, Ukraine" },
  "belarus": { ianaZone: "Europe/Minsk", label: "Belarus" },
  "serbia": { ianaZone: "Europe/Belgrade", label: "Serbia" },
  "croatia": { ianaZone: "Europe/Zagreb", label: "Croatia" },
  "bosnia": { ianaZone: "Europe/Sarajevo", label: "Bosnia and Herzegovina" },
  "slovenia": { ianaZone: "Europe/Ljubljana", label: "Slovenia" },
  "albania": { ianaZone: "Europe/Tirane", label: "Albania" },
  "north macedonia": { ianaZone: "Europe/Skopje", label: "North Macedonia" },
  "montenegro": { ianaZone: "Europe/Podgorica", label: "Montenegro" },
  "lithuania": { ianaZone: "Europe/Vilnius", label: "Lithuania" },
  "latvia": { ianaZone: "Europe/Riga", label: "Latvia" },
  "estonia": { ianaZone: "Europe/Tallinn", label: "Estonia" },
  "luxembourg": { ianaZone: "Europe/Luxembourg", label: "Luxembourg" },
  "malta": { ianaZone: "Europe/Malta", label: "Malta" },
  "cyprus": { ianaZone: "Asia/Nicosia", label: "Cyprus" },
  "moldova": { ianaZone: "Europe/Chisinau", label: "Moldova" },
  "netherlands": { ianaZone: "Europe/Amsterdam", label: "Netherlands" },
  "norway": { ianaZone: "Europe/Oslo", label: "Norway" },
  "sweden": { ianaZone: "Europe/Stockholm", label: "Sweden" },
  "finland": { ianaZone: "Europe/Helsinki", label: "Finland" },
  "poland": { ianaZone: "Europe/Warsaw", label: "Poland" },
  "greece": { ianaZone: "Europe/Athens", label: "Greece" },
  // Caucasus / Central Asia
  "georgia": { ianaZone: "Asia/Tbilisi", label: "Georgia" },
  "armenia": { ianaZone: "Asia/Yerevan", label: "Armenia" },
  "azerbaijan": { ianaZone: "Asia/Baku", label: "Azerbaijan" },
  "kazakhstan": { ianaZone: "Asia/Almaty", label: "Kazakhstan" },
  "uzbekistan": { ianaZone: "Asia/Tashkent", label: "Uzbekistan" },
  "turkmenistan": { ianaZone: "Asia/Ashgabat", label: "Turkmenistan" },
  "kyrgyzstan": { ianaZone: "Asia/Bishkek", label: "Kyrgyzstan" },
  "tajikistan": { ianaZone: "Asia/Dushanbe", label: "Tajikistan" },
  "mongolia": { ianaZone: "Asia/Ulaanbaatar", label: "Mongolia" },
  // South / Southeast Asia
  "afghanistan": { ianaZone: "Asia/Kabul", label: "Afghanistan" },
  "nepal": { ianaZone: "Asia/Kathmandu", label: "Nepal" },
  "bhutan": { ianaZone: "Asia/Thimphu", label: "Bhutan" },
  "sri lanka": { ianaZone: "Asia/Colombo", label: "Sri Lanka" },
  "myanmar": { ianaZone: "Asia/Yangon", label: "Myanmar" },
  "cambodia": { ianaZone: "Asia/Phnom_Penh", label: "Cambodia" },
  "laos": { ianaZone: "Asia/Vientiane", label: "Laos" },
  "vietnam": { ianaZone: "Asia/Ho_Chi_Minh", label: "Vietnam" },
  "philippines": { ianaZone: "Asia/Manila", label: "Philippines" },
  "manila": { ianaZone: "Asia/Manila", label: "Manila, Philippines" },
  "brunei": { ianaZone: "Asia/Brunei", label: "Brunei" },
  "taiwan": { ianaZone: "Asia/Taipei", label: "Taiwan" },
  "north korea": { ianaZone: "Asia/Pyongyang", label: "North Korea" },
  "bangladesh": { ianaZone: "Asia/Dhaka", label: "Bangladesh" },
  "indonesia": { ianaZone: "Asia/Jakarta", label: "Indonesia" },
  "iran": { ianaZone: "Asia/Tehran", label: "Iran" },
  // Middle East
  "israel": { ianaZone: "Asia/Jerusalem", label: "Israel" },
  "palestine": { ianaZone: "Asia/Gaza", label: "Palestine" },
  "jordan": { ianaZone: "Asia/Amman", label: "Jordan" },
  "lebanon": { ianaZone: "Asia/Beirut", label: "Lebanon" },
  "syria": { ianaZone: "Asia/Damascus", label: "Syria" },
  "iraq": { ianaZone: "Asia/Baghdad", label: "Iraq" },
  "kuwait": { ianaZone: "Asia/Kuwait", label: "Kuwait" },
  "qatar": { ianaZone: "Asia/Qatar", label: "Qatar" },
  "bahrain": { ianaZone: "Asia/Bahrain", label: "Bahrain" },
  "oman": { ianaZone: "Asia/Muscat", label: "Oman" },
  "yemen": { ianaZone: "Asia/Aden", label: "Yemen" },
  // Americas
  "guatemala": { ianaZone: "America/Guatemala", label: "Guatemala" },
  "belize": { ianaZone: "America/Belize", label: "Belize" },
  "honduras": { ianaZone: "America/Tegucigalpa", label: "Honduras" },
  "el salvador": { ianaZone: "America/El_Salvador", label: "El Salvador" },
  "nicaragua": { ianaZone: "America/Managua", label: "Nicaragua" },
  "costa rica": { ianaZone: "America/Costa_Rica", label: "Costa Rica" },
  "panama": { ianaZone: "America/Panama", label: "Panama" },
  "cuba": { ianaZone: "America/Havana", label: "Cuba" },
  "jamaica": { ianaZone: "America/Jamaica", label: "Jamaica" },
  "haiti": { ianaZone: "America/Port-au-Prince", label: "Haiti" },
  "dominican republic": { ianaZone: "America/Santo_Domingo", label: "Dominican Republic" },
  "bahamas": { ianaZone: "America/Nassau", label: "Bahamas" },
  "trinidad": { ianaZone: "America/Port_of_Spain", label: "Trinidad and Tobago" },
  "trinidad and tobago": { ianaZone: "America/Port_of_Spain", label: "Trinidad and Tobago" },
  "barbados": { ianaZone: "America/Barbados", label: "Barbados" },
  "puerto rico": { ianaZone: "America/Puerto_Rico", label: "Puerto Rico" },
  "colombia": { ianaZone: "America/Bogota", label: "Colombia" },
  "bogota": { ianaZone: "America/Bogota", label: "Bogotá, Colombia" },
  "venezuela": { ianaZone: "America/Caracas", label: "Venezuela" },
  "ecuador": { ianaZone: "America/Guayaquil", label: "Ecuador" },
  "peru": { ianaZone: "America/Lima", label: "Peru" },
  "lima": { ianaZone: "America/Lima", label: "Lima, Peru" },
  "bolivia": { ianaZone: "America/La_Paz", label: "Bolivia" },
  "paraguay": { ianaZone: "America/Asuncion", label: "Paraguay" },
  "uruguay": { ianaZone: "America/Montevideo", label: "Uruguay" },
  "chile": { ianaZone: "America/Santiago", label: "Chile" },
  "santiago": { ianaZone: "America/Santiago", label: "Santiago, Chile" },
  "guyana": { ianaZone: "America/Guyana", label: "Guyana" },
  "suriname": { ianaZone: "America/Paramaribo", label: "Suriname" },
  // Oceania
  "fiji": { ianaZone: "Pacific/Fiji", label: "Fiji" },
  "papua new guinea": { ianaZone: "Pacific/Port_Moresby", label: "Papua New Guinea" },
  "samoa": { ianaZone: "Pacific/Apia", label: "Samoa" },
  "tonga": { ianaZone: "Pacific/Tongatapu", label: "Tonga" },
  "vanuatu": { ianaZone: "Pacific/Efate", label: "Vanuatu" },
  "solomon islands": { ianaZone: "Pacific/Guadalcanal", label: "Solomon Islands" },
  "palau": { ianaZone: "Pacific/Palau", label: "Palau" },
  "marshall islands": { ianaZone: "Pacific/Majuro", label: "Marshall Islands" },
  "micronesia": { ianaZone: "Pacific/Chuuk", label: "Micronesia" },
  "kiribati": { ianaZone: "Pacific/Tarawa", label: "Kiribati" },
  "nauru": { ianaZone: "Pacific/Nauru", label: "Nauru" },
  "tuvalu": { ianaZone: "Pacific/Funafuti", label: "Tuvalu" },
};

// `fallback` is the user's own IP-detected location (if any) — used when the
// question doesn't name a specific place ("what time is it?" implicitly
// means "here"), instead of always defaulting to UTC.
function detectTimeQuery(
  text: string,
  fallback?: { ianaZone: string; label: string } | null,
): { ianaZone: string; label: string } | null {
  const lower = text.toLowerCase().trim();
  const isTimeQuestion =
    /\b(what.?s the time|what time is it|current time|time now|time (in|at|for)|clock in|timezone|time zone)\b/.test(lower);
  if (!isTimeQuestion) return null;

  // Pad with spaces so boundary check works at start/end of string too.
  // Match only when key is surrounded by non-letter characters (word-boundary safe for multi-word phrases).
  const padded = ` ${lower} `;
  const keys = Object.keys(TIMEZONE_MAP).sort((a, b) => b.length - a.length); // longest first
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Ensure the key is not adjacent to another letter (e.g. "uk" won't match inside "lucky")
    if (new RegExp(`[^a-z]${escaped}[^a-z]`).test(padded)) {
      return TIMEZONE_MAP[key];
    }
  }

  // No named location → use the user's own IP-detected timezone if we have
  // one, otherwise fall back to UTC.
  return fallback ?? { ianaZone: "UTC", label: "UTC / Coordinated Universal Time" };
}

// ── IP-based location detection (no browser permission prompt) ────────────────
// Uses the request's IP address only — never the browser Geolocation API —
// so we can default "what time is it" to the user's own timezone without
// ever asking for location permission.
function getClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
}

interface DetectedLocation { country: string; ianaZone: string; label: string; lat?: number; lon?: number }

async function geolocateIp(ip: string | null, requestId: string): Promise<DetectedLocation | null> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("::1") || ip.startsWith("192.168.") || ip.startsWith("10.")) return null;
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      success?: boolean; country?: string; city?: string;
      timezone?: { id?: string }; latitude?: number; longitude?: number;
    };
    if (!data.success || !data.timezone?.id || !data.country) return null;
    const label = data.city ? `${data.city}, ${data.country}` : data.country;
    return {
      country: data.country, ianaZone: data.timezone.id, label,
      lat: typeof data.latitude === "number" ? data.latitude : undefined,
      lon: typeof data.longitude === "number" ? data.longitude : undefined,
    };
  } catch (err) {
    log("warn", "geolocate_ip.failed", { requestId, error: String(err) });
    return null;
  }
}

// ── Weather query detection + lookup (Open-Meteo — free, no API key) ──────────
// Mirrors the time-widget pattern above: detect a weather-style question,
// resolve it to coordinates (either a named place via geocoding, or the
// user's own IP-detected location), then fetch live current conditions.
const WEATHER_CODE_MAP: Record<number, { condition: string; icon: string }> = {
  0: { condition: "Clear sky", icon: "sun" },
  1: { condition: "Mostly clear", icon: "sun" },
  2: { condition: "Partly cloudy", icon: "cloud-sun" },
  3: { condition: "Overcast", icon: "cloud" },
  45: { condition: "Fog", icon: "fog" },
  48: { condition: "Depositing rime fog", icon: "fog" },
  51: { condition: "Light drizzle", icon: "drizzle" },
  53: { condition: "Drizzle", icon: "drizzle" },
  55: { condition: "Dense drizzle", icon: "drizzle" },
  56: { condition: "Freezing drizzle", icon: "drizzle" },
  57: { condition: "Dense freezing drizzle", icon: "drizzle" },
  61: { condition: "Light rain", icon: "rain" },
  63: { condition: "Rain", icon: "rain" },
  65: { condition: "Heavy rain", icon: "rain" },
  66: { condition: "Freezing rain", icon: "rain" },
  67: { condition: "Heavy freezing rain", icon: "rain" },
  71: { condition: "Light snow", icon: "snow" },
  73: { condition: "Snow", icon: "snow" },
  75: { condition: "Heavy snow", icon: "snow" },
  77: { condition: "Snow grains", icon: "snow" },
  80: { condition: "Light rain showers", icon: "rain" },
  81: { condition: "Rain showers", icon: "rain" },
  82: { condition: "Violent rain showers", icon: "rain" },
  85: { condition: "Snow showers", icon: "snow" },
  86: { condition: "Heavy snow showers", icon: "snow" },
  95: { condition: "Thunderstorm", icon: "storm" },
  96: { condition: "Thunderstorm with hail", icon: "storm" },
  99: { condition: "Severe thunderstorm with hail", icon: "storm" },
};

function isWeatherQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(weather|temperature|forecast|how (hot|cold|warm) is it|is it (raining|snowing|sunny|cloudy|windy)|humidity|wind speed)\b/.test(lower);
}

// Best-effort extraction of a named place from "weather in <place>" style
// phrasing. Returns null when no explicit place is named (caller then falls
// back to the user's own IP-detected location, same as the time widget).
function extractWeatherPlace(text: string): string | null {
  const m = text.match(/\b(?:weather|temperature|forecast|humidity|wind speed)\b(?:\s+\w+){0,3}?\s+(?:in|at|for)\s+([a-z\s,.'-]+?)(?:[?.!]|$)/i)
    ?? text.match(/\bin\s+([a-z\s,.'-]+?)\s+(?:weather|temperature|forecast)\b/i);
  const place = m?.[1]?.trim();
  return place && place.length > 1 && place.length < 80 ? place : null;
}

async function geocodePlace(place: string, requestId: string): Promise<{ lat: number; lon: number; label: string } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string; country?: string }> };
    const hit = data.results?.[0];
    if (!hit) return null;
    const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
    return { lat: hit.latitude, lon: hit.longitude, label };
  } catch (err) {
    log("warn", "geocode_place.failed", { requestId, place, error: String(err) });
    return null;
  }
}

interface WeatherInfo {
  label: string; tempC: number; feelsLikeC: number; condition: string; icon: string;
  windKph: number; humidity: number; isDay: boolean;
}

async function fetchWeather(lat: number, lon: number, label: string, requestId: string): Promise<WeatherInfo | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day` +
        `&temperature_unit=celsius&wind_speed_unit=kmh`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      current?: {
        temperature_2m?: number; relative_humidity_2m?: number; apparent_temperature?: number;
        weather_code?: number; wind_speed_10m?: number; is_day?: number;
      };
    };
    const c = data.current;
    if (!c || typeof c.temperature_2m !== "number" || typeof c.weather_code !== "number") return null;
    const mapped = WEATHER_CODE_MAP[c.weather_code] ?? { condition: "Unknown", icon: "cloud" };
    return {
      label,
      tempC: Math.round(c.temperature_2m),
      feelsLikeC: Math.round(c.apparent_temperature ?? c.temperature_2m),
      condition: mapped.condition,
      icon: mapped.icon,
      windKph: Math.round(c.wind_speed_10m ?? 0),
      humidity: Math.round(c.relative_humidity_2m ?? 0),
      isDay: c.is_day !== 0,
    };
  } catch (err) {
    log("warn", "fetch_weather.failed", { requestId, lat, lon, error: String(err) });
    return null;
  }
}

/**
 * `fallback` is the user's own IP-detected location (if any) — same
 * "what's the weather" implicitly means "here" pattern as detectTimeQuery.
 * Unlike time, weather needs real coordinates, so a named place is resolved
 * via free geocoding rather than a static timezone map.
 */
async function detectWeatherQuery(
  text: string,
  fallback: DetectedLocation | null | undefined,
  requestId: string,
): Promise<WeatherInfo | null> {
  if (!isWeatherQuery(text)) return null;

  const namedPlace = extractWeatherPlace(text);
  if (namedPlace) {
    const geo = await geocodePlace(namedPlace, requestId);
    if (geo) return fetchWeather(geo.lat, geo.lon, geo.label, requestId);
  }

  if (fallback?.lat != null && fallback?.lon != null) {
    return fetchWeather(fallback.lat, fallback.lon, fallback.label, requestId);
  }

  return null;
}

// ── Search SKIP patterns ───────────────────────────────────────────────────────
// Web search is ONLY triggered for queries that genuinely need live/external data.
// Everything else is answered from model knowledge + system prompt.
const NO_SEARCH_PATTERNS: RegExp[] = [
  // Pure math / logic
  /^(calculate|compute|solve|prove|evaluate|simplify|differentiate|integrate|factorise|factorize)\b/i,
  // Pure creative writing
  /^(write (me )?(a |an )?(poem|song|story|joke|essay|riddle|limerick|haiku|letter)|tell me a (joke|riddle|story)|compose (a |an )?)/i,
  // Code tasks (no real-world lookup needed)
  /^(fix (this|my|the) (bug|code|error|function)|debug (this|my)|refactor (this|my)|explain (this|my) code|what does this code|how does this code|convert (this|my) code)/i,
  // Greetings / small talk
  /^(hi\b|hello\b|hey\b|thanks|thank you|good (morning|afternoon|evening|night)|how are you|what can you do|can you help|sup\b|yo\b)/i,
  // Grammar / spelling / translation
  /^(translate|grammar|spell|proofread|check grammar|fix grammar|correct (this|my))/i,
  // Identity / AI persona questions  -  answered by system prompt, NEVER by web search
  /\b(what is your name|what('s| is) your name|who are you|what are you|how old are you|where (are you from|do you come from)|who (made|built|created|trained) you|when were you (made|created|built)|what version|what model are you|are you (an )?ai|are you (a )?bot|are you human|your name|do you have (a )?name)\b/i,
  // Ownership / training / founder questions — must be answered from identity, not web search
  /\b(who (is your|are your|trained your|built your|owns? your|created your|developed your)|who (is behind|founded|created|owns?|built|made|developed) (you|this|engagera|afuai|afuchat)|who (is|are) (the )?(founder|creator|owner|developer|team|parent company)|what (company|team|organisation|organization) (made|built|trained|created|owns?|is behind) (you|this|engagera|afuai|afuchat)|your (founder|creator|owner|parent company|training|origins|background))\b/i,
  // Direct AfuAI / AfuChat / Engagera identity questions — always answered from system prompt
  /\b(what is afuai|who is afuai|what is afuchat|who is afuchat|afuai team|afuchat technologies|parent company|who owns engagera|what is engagera|who (made|built|created|trained|founded|owns?) engagera)\b/i,
  // Personal/opinion/feeling questions directed at the AI
  /^(do you (like|love|hate|enjoy|have|feel|think|know|want|prefer|believe)|what do you (think|feel|prefer|like|love)|can you feel|are you (happy|sad|conscious|sentient|alive))/i,
  // Conversational continuations
  /^(ok|okay|sure|sounds good|got it|makes sense|i see|i understand|tell me more|go on|continue|elaborate|explain more|what else|anything else)/i,
  // Math and unit conversions
  /^(\d[\d\s\+\-\*\/\(\)\.]*=|\d+\s*(plus|minus|times|divided|percent|%)|convert \d)/i,
  // Questions about the current conversation
  /^(what did (i|you|we) (say|ask|mention|discuss)|what was (my|your|our) (last|previous|first)|summaris(e|ize) (this|our|the) conversation|what have we (talked|spoken|discussed))/i,
  // Time queries — answered via system clock + clock widget, web search adds no value
  /\b(what.?s the time|what time is it|current time (in|at)?|time right now|time in [a-z]|clock in [a-z])\b/i,
  // Weather queries — answered via the live weather widget, web search adds no value
  /\b(weather|temperature|forecast|is it (raining|snowing|sunny|cloudy|windy))\b/i,
  // Generic media/content recommendations — AI already knows; web search only returns listing sites, not titles
  /^(suggest (me )?(a |some )?(good )?(movie|film|show|series|tv show|anime|book|song|album|game|podcast)s?)/i,
  /^(recommend (me )?(a |some )?(good )?(movie|film|show|series|tv show|anime|book|song|album|game|podcast)s?)/i,
  /^(what (movie|film|show|series|tv show|anime|book|song|game) (should i|can i) (watch|read|play|listen))/i,
  /^(good (movie|film|show|series|anime|book|song|game|podcast) (to |for )?(watch|read|play|listen|today|tonight|weekend))/i,
  /^(best (movie|film|show|series|anime|book|song|game|podcast) (to |for )?(watch|read|play|listen|today|tonight|weekend))/i,
  /^(movies? (to watch|for tonight|for today|for the weekend|recommendation|suggestion)s?)/i,
  /^(what (are some|are the best|movies?|films?|shows?|series) (to watch|i should watch|worth watching|you (recommend|suggest)))/i,
];

// ── Build a clean, focused search query ───────────────────────────────────────
function buildSearchQuery(userText: string, conversationContext?: string): string {
  let q = userText
    .replace(/please|could you|can you|would you|kindly|i want to know|i'd like to know|i need to know|give me|find me|search for|look up/gi, "")
    .replace(/\s+/g, " ").trim()
    .slice(0, 180);

  // If the question is very short, append context from conversation
  if (q.length < 30 && conversationContext) {
    q = `${q} ${conversationContext}`.slice(0, 180);
  }

  return q;
}

/** Pick a contextually appropriate search-status message for the given query. */
function getSearchStatusMessage(query: string): string {
  const q = query.toLowerCase();
  if (/weather|forecast|temperature|rain|snow|sun|wind|humidity/.test(q))
    return "Fetching live results...";
  if (/price|cost|stock|bitcoin|crypto|currency|rate|exchange/.test(q))
    return "Fetching live results...";
  if (/news|breaking|latest|today|recent/.test(q))
    return "Looking up the latest information...";
  if (/ceo|president|founder|owner|minister|governor|official|director|chairman/.test(q))
    return "Checking official sources...";
  if (/score|result|match|game|winner|election|vote/.test(q))
    return "Fetching live results...";
  if (/version|release|update|changelog|docs|documentation/.test(q))
    return "Finding accurate information...";
  return "Searching the web...";
}

// ── Search trigger: ONLY search when the user's message explicitly calls for it ─
// The model answers from its own knowledge by default.
// Web search is reserved for: explicit requests, live/current data, news, prices, scores.
function needsWebSearch(messages: ChatMessage[]): string | null {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return null;
  const text = typeof last.content === "string" ? last.content : "";
  if (!text || text.length < 4) return null;

  const t = text.trim().toLowerCase();

  // ── Hard no-search: identity, creative, code, math, conversation ─────────────
  for (const re of NO_SEARCH_PATTERNS) {
    if (re.test(text.trim())) return null;
  }
  if ((text.match(/```/g) ?? []).length >= 2) return null;

  // ── Explicit search request by the user ──────────────────────────────────────
  const explicitSearch = [
    /\b(search|look up|look it up|google|bing|find online|check online|search (the )?(web|internet|online)|search for|research)\b/i,
    /\b(what('s| is) (happening|going on)|latest (news|update|info|information|report|development)|breaking news|recent news|current news)\b/i,
    /\b(today'?s? (news|update|score|price|rate|result)|this (week|month)'?s? (news|update|result))\b/i,
  ];
  if (explicitSearch.some((re) => re.test(text))) return text;

  // ── Live / time-sensitive data the model cannot know ─────────────────────────
  const liveData = [
    // Prices and markets
    /\b(current (price|cost|rate|value)|price of|how much (is|does|do|cost)|stock price|share price|crypto price|bitcoin price|ethereum price|exchange rate|usd to|gbp to|eur to|ngn to)\b/i,
    // Scores and sports
    /\b((today'?s?|live|current|final|match|game) (score|result|fixture|standing)|who won (the )?(game|match|race|election)|premier league|bundesliga|la liga|nba|nfl|nhl|cricket score)\b/i,
    // Elections, polls, referendums — real-time outcomes
    /\b(election result|vote result|poll result|referendum result)\b/i,
    // Trending / viral
    /\b(trending (now|today|right now)|what'?s? trending|going viral|viral (now|today))\b/i,
    // Explicit "right now / live" qualifiers on factual questions
    /\b(right now|as of (today|now|this moment)|at (this|the) moment|currently happening|live (update|score|data|feed))\b/i,
    // Obituaries / recent deaths
    /\b(just died|recently died|passed away recently|death of .{3,40} (today|this week|recently))\b/i,
  ];
  if (liveData.some((re) => re.test(text))) return text;

  // ── Specific named-entity lookups that likely need fresh data ─────────────────
  // e.g. "Who is [very recent person]?" — but only when paired with recency signals
  const recencySignals = /\b(new|newly|recently|just (launched|released|announced|appointed|elected)|latest version|2025|2026)\b/i;
  const entityLookup   = /\b(who is|what is|tell me about|info (on|about)|details (on|about))\b/i;
  if (recencySignals.test(t) && entityLookup.test(t)) return text;

  // ── Leadership, pricing, software versions — frequently changing facts ─────────
  const currentFacts = [
    // CEO, founder, executive roles, company ownership
    /\b(who is (the )?(ceo|cto|cfo|coo|cmo|cpo|president|founder|co-?founder|chairman|owner|director|head|chief|leader|boss|vp|vice president) of|current (ceo|president|founder|chairman|owner) of|who (owns|runs|leads|heads|founded|controls) (?!this|our|my)\w)/i,
    // Product and service pricing
    /\b(how much (is|does|do|costs?) (?!it (take|weigh|measure))|price of|cost of|subscription (price|cost|fee|plan)|monthly (plan|fee|cost|price)|annual (plan|fee|cost|price)|pricing (for|of)|current price)\b/i,
    // Package versions, software releases
    /\b(latest (stable )?(version|release) of|current (stable )?(version|release) of|what version (is|of)|how to (install|set up|configure|integrate) .{3,40})\b/i,
    // Government and official positions
    /\b(who is (the )?(prime minister|president|governor|secretary of state|home secretary|chancellor|senator|mayor|minister|attorney general) of|current (prime minister|president|governor|chancellor) of)\b/i,
    // Live event status and operating hours
    /\b(is .{2,40} (open|closed|live|happening|on) (today|right now|tonight|now)|what (time|hours?) (does|do|are) .{2,30} (open|close|start|end|begin) (today|tonight))\b/i,
  ];
  if (currentFacts.some((re) => re.test(text))) return text;

  // Everything else: model answers from its own knowledge. No search.
  return null;
}

// ── Agentic chat: URL crawl + pre-search + multi-provider call ───────────────
async function agenticChat(
  db: ReturnType<typeof createClient>,
  keys: ProviderKeys,
  chain: ProviderModel[],
  messages: ChatMessage[],
  requestId: string,
  braveKey?: string,
): Promise<{ reply:string; inputTokens:number; outputTokens:number; provider?:string; providerModel?:string; searchInfo?: { query:string; sources:Source[] }; crawledUrls?: string[]; crawledSources?: Source[] }> {
  let baseConvo: ChatMessage[] = [...messages];

  // Step 0  -  Auto-detect and fetch URLs mentioned in the user's message
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUser ? (typeof lastUser.content === "string" ? lastUser.content : getTextPreview(lastUser.content as MessageContent)) : "";

  let crawledUrls: string[] = [];
  let crawledSources: Source[] = [];
  if (lastUserText) {
    const urls = detectURLs(lastUserText);
    if (urls.length > 0) {
      log("info", "url_crawl.start", { requestId, urls });
      try {
        const fetched = await Promise.allSettled(urls.map((u) => afuBotFetch(u).then((result) => ({ url: u, ...result }))));
        const urlParts: string[] = [];
        for (const r of fetched) {
          if (r.status === "fulfilled") {
            const { url: rUrl, text, image, pageTitle } = r.value;
            const bad = ["Could not fetch", "Failed to fetch", "Invalid URL", "is not a readable webpage", "not permitted"];
            if (!bad.some((b) => text.startsWith(b))) {
              urlParts.push(`### Content from: ${rUrl}\n\n${text}`);
              crawledUrls.push(rUrl);
              crawledSources.push({
                url:     rUrl,
                title:   pageTitle || rUrl,
                snippet: text.replace(/^#[^\n]*\n+/, "").slice(0, 120).trim(),
                ...(image && { image }),
              });
            }
          }
        }
        if (urlParts.length > 0) {
          const crawlBlock = `\n\n---\n[LIVE PAGE CONTENT — fetched right now by AfuBot]\n\n${urlParts.join("\n\n---\n\n")}\n---\n\nINSTRUCTION: You have just browsed the above URL(s) in real-time. Present the content to the user in a clean, well-organised format:\n- Start with the page title and source URL\n- Use headings to separate sections (pricing, features, team, docs, articles, etc.)\n- Use bullet points or numbered lists where appropriate\n- Highlight the most important or interesting information first\n- If the user asked a specific question about the page, answer it directly using the content above\n- Do NOT say you "cannot access" or "cannot browse" — you already have the content above\n- Do NOT dump raw text — always organise and present it cleanly`;
          const newConvo = [...baseConvo];
          const sysIdx = newConvo.findIndex((m) => m.role === "system");
          if (sysIdx >= 0 && typeof newConvo[sysIdx].content === "string") {
            newConvo[sysIdx] = { ...newConvo[sysIdx], content: (newConvo[sysIdx].content as string) + crawlBlock };
          } else {
            newConvo.unshift({ role: "system", content: crawlBlock });
          }
          baseConvo = newConvo;
          log("info", "url_crawl.done", { requestId, count: crawledUrls.length });
        }
      } catch (err) {
        log("warn", "url_crawl.exception", { requestId, error: String(err) });
      }
    }
  }

  // ── Tool: Weather (wttr.in — free, no key required) ─────────────────────────
  if (lastUserText) {
    const weatherLoc = detectWeatherQuery(lastUserText);
    if (weatherLoc) {
      const weatherData = await fetchWeather(weatherLoc, requestId);
      if (weatherData) {
        const weatherBlock = `\n\n---\n🌤️ **Live weather data** (retrieved just now from wttr.in):\n\n${weatherData}\n---\n\nPresent this weather information naturally and conversationally.`;
        const wConvo = [...baseConvo];
        const wsysIdx = wConvo.findIndex((m) => m.role === "system");
        if (wsysIdx >= 0 && typeof wConvo[wsysIdx].content === "string") {
          wConvo[wsysIdx] = { ...wConvo[wsysIdx], content: (wConvo[wsysIdx].content as string) + weatherBlock };
        } else { wConvo.unshift({ role: "system", content: weatherBlock }); }
        const wResult = await callWithFallback(chain, keys, wConvo, 1024, requestId);
        if (wResult.ok) {
          log("info", "weather.tool.success", { requestId, location: weatherLoc });
          return { reply: wResult.content, inputTokens: wResult.inputTokens, outputTokens: wResult.outputTokens,
            provider: wResult.provider, providerModel: wResult.model, ...(crawledUrls.length && { crawledUrls }), ...(crawledSources.length && { crawledSources }) };
        }
      }
    }
  }

  // ── Tool: Currency rates (Frankfurter ECB + Open ER — free, no key) ──────────
  if (lastUserText) {
    const currencyQ = detectCurrencyQuery(lastUserText);
    if (currencyQ) {
      const rateData = await fetchCurrencyRate(currencyQ, requestId);
      if (rateData) {
        const rateBlock = `\n\n---\n${rateData}\n---\n\nPresent this exchange rate naturally and conversationally.`;
        const cConvo = [...baseConvo];
        const csysIdx = cConvo.findIndex((m) => m.role === "system");
        if (csysIdx >= 0 && typeof cConvo[csysIdx].content === "string") {
          cConvo[csysIdx] = { ...cConvo[csysIdx], content: (cConvo[csysIdx].content as string) + rateBlock };
        } else { cConvo.unshift({ role: "system", content: rateBlock }); }
        const cResult = await callWithFallback(chain, keys, cConvo, 512, requestId);
        if (cResult.ok) {
          log("info", "currency.tool.success", { requestId, from: currencyQ.from, to: currencyQ.to });
          return { reply: cResult.content, inputTokens: cResult.inputTokens, outputTokens: cResult.outputTokens,
            provider: cResult.provider, providerModel: cResult.model, ...(crawledUrls.length && { crawledUrls }), ...(crawledSources.length && { crawledSources }) };
        }
      }
    }
  }

  // ── Tool: Movie recommendations (TMDB — real metadata, requires TMDB_API_KEY) ─
  if (lastUserText) {
    const movieQ = detectMovieQuery(lastUserText);
    const tmdbKey = Deno.env.get("TMDB_API_KEY");
    if (movieQ && tmdbKey) {
      const movies = await fetchMovieRecommendations(movieQ, tmdbKey, requestId);
      if (movies && movies.length > 0) {
        const movieBlock = formatMovieBlock(movies);
        const mConvo = [...baseConvo];
        const msysIdx = mConvo.findIndex((m) => m.role === "system");
        if (msysIdx >= 0 && typeof mConvo[msysIdx].content === "string") {
          mConvo[msysIdx] = { ...mConvo[msysIdx], content: (mConvo[msysIdx].content as string) + movieBlock };
        } else { mConvo.unshift({ role: "system", content: movieBlock }); }
        const mResult = await callWithFallback(chain, keys, mConvo, 1536, requestId);
        if (mResult.ok) {
          // Swap the short CDN URLs the model saw for reliable base64 data
          // URIs before returning to the client — this is what makes the
          // posters immune to the client's own network reaching TMDB's CDN.
          let finalReply = mResult.content;
          for (const m of movies) {
            if (m.cdnUrl && m.dataUri) finalReply = finalReply.split(m.cdnUrl).join(m.dataUri);
          }
          log("info", "movies.tool.success", { requestId, count: movies.length, similarTo: movieQ.similarTo, genres: movieQ.genreIds, postersInlined: movies.filter((m) => m.dataUri).length });
          return { reply: finalReply, inputTokens: mResult.inputTokens, outputTokens: mResult.outputTokens,
            provider: mResult.provider, providerModel: mResult.model, ...(crawledUrls.length && { crawledUrls }), ...(crawledSources.length && { crawledSources }) };
        }
      } else {
        log("warn", "movies.tool.no_results", { requestId, similarTo: movieQ.similarTo, genres: movieQ.genreIds });
      }
    }
  }

  // ── Check shared knowledge base before doing a live web search ──────────────
  // If ANY prior user already searched for this, reuse the cached search results.
  // The AI still generates a fresh response from the cached context every time.
  const kbQueryRaw = buildSearchQuery(lastUserText, "");
  const kbKey      = normalizeKbKey(kbQueryRaw);
  const kbHit      = lastUserText.length > 8 ? await lookupKB(db, kbKey) : null;

  if (kbHit) {
    log("info", "kb.hit", { requestId, kbKey: kbKey.slice(0, 60), sources: kbHit.sources.length });
    const kbBlock = [
      "",
      "---",
      `🧠 **Verified knowledge** (researched & cached by Engagera — ${new Date().toUTCString()}):`,
      "",
      kbHit.searchText,
      "",
      "---",
      "",
      "INSTRUCTIONS: Answer using ONLY the verified knowledge above for any factual claim, figure, date, name, quote, or detail. " +
      "Report exactly what was found on the sources — do not invent, alter, round, guess, or 'fill in' any detail that is not explicitly present in the text above. " +
      "If the verified knowledge above does not contain a detail the user asked for, say plainly that it wasn't found in what you read rather than guessing or fabricating an answer. " +
      "General background knowledge may only be used for framing/context around the verified facts, never to replace or supplement a specific fact, number, or claim the data above doesn't support. " +
      "When referencing where information comes from, say the source name naturally in text (e.g. 'According to Wikipedia, ...' or 'Reuters notes that ...'). " +
      "Do NOT use markdown hyperlinks [Title](URL) — cite source names only.",
    ].join("\n");
    const kbConvo = [...baseConvo];
    const sysIdx  = kbConvo.findIndex((m) => m.role === "system");
    if (sysIdx >= 0 && typeof kbConvo[sysIdx].content === "string") {
      kbConvo[sysIdx] = { ...kbConvo[sysIdx], content: (kbConvo[sysIdx].content as string) + kbBlock };
    } else {
      kbConvo.unshift({ role: "system", content: kbBlock });
    }
    const kbResult = await callWithFallback(chain, keys, kbConvo, 4096, requestId);
    if (kbResult.ok) {
      return {
        reply: kbResult.content, inputTokens: kbResult.inputTokens, outputTokens: kbResult.outputTokens,
        provider: kbResult.provider, providerModel: kbResult.model,
        ...(kbHit.sources.length > 0 && { searchInfo: { query: kbQueryRaw, sources: kbHit.sources } }),
        ...(crawledUrls.length > 0   && { crawledUrls }),
        ...(crawledSources.length > 0 && { crawledSources }),
      };
    }
    log("warn", "kb.ai_call_failed_fallback_search", { requestId });
    // AI call failed with KB context — fall through to live search below
  }

  // Step 1  -  Real-world grounding: search + deep-crawl top results
  const userText = needsWebSearch(messages);

  if (userText) {
    try {
      // Build the conversation context for short queries
      const recentContext = messages
        .filter((m) => m.role === "user")
        .slice(-3)
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .join(" ").slice(0, 120);

      const query = buildSearchQuery(userText, recentContext);
      log("info", "pre_search.start", { requestId, query });

      let searchResult = await webSearch(query, braveKey);
      log("info", "pre_search.done", { requestId, sourceCount: searchResult.sources.length });

      // ── Retry with a simplified query if we got < 3 sources ─────────────────
      if (searchResult.sources.length < 3) {
        const shortQuery = query.split(/\s+/).slice(0, 6).join(" ");
        if (shortQuery.length > 8 && shortQuery !== query.trim()) {
          log("info", "pre_search.retry", { requestId, shortQuery });
          const retry = await webSearch(shortQuery, braveKey);
          if (retry.sources.length > searchResult.sources.length) {
            searchResult = retry;
            log("info", "pre_search.retry_better", { requestId, sourceCount: retry.sources.length });
          }
        }
      }

      // Domain-crawl fallback removed: AfuChat / AfuAI / Engagera identity
      // questions are blocked in NO_SEARCH_PATTERNS and answered from the
      // system-prompt identity — no web crawl needed or desired.

      const hasResults = searchResult.sources.length > 0 ||
        (!searchResult.text.startsWith("No results") && !searchResult.text.startsWith("Search unavailable") && !searchResult.text.startsWith("Search failed"));

      if (hasResults) {
        // ── Deep-crawl the top 2 sources for full page content ────────────────
        const topUrls = searchResult.sources
          .slice(0, 2)
          .map((s) => s.url)
          .filter((u) => u && u.startsWith("http") && !u.includes("youtube.com") && !u.includes("twitter.com") && !u.includes("facebook.com"));

        const deepParts: string[] = [];
        if (topUrls.length > 0) {
          log("info", "deep_crawl.start", { requestId, urls: topUrls });
          const crawled = await Promise.allSettled(
            topUrls.map((u) => afuBotFetch(u).then((result) => ({ url: u, ...result })))
          );
          for (const r of crawled) {
            if (r.status === "fulfilled") {
              const { url, text, image } = r.value;
              const bad = ["Could not fetch", "Failed to fetch", "Invalid URL", "Search unavailable"];
              if (!bad.some((b) => text.startsWith(b)) && text.length > 200) {
                deepParts.push(`### Full content from: ${url}\n\n${text.slice(0, 2500)}`);
                // Enrich the matching search source with the og:image extracted from the page
                if (image) {
                  const idx = searchResult.sources.findIndex((s) => s.url === url);
                  if (idx >= 0) searchResult.sources[idx] = { ...searchResult.sources[idx], image };
                }
              }
            }
          }
          log("info", "deep_crawl.done", { requestId, fetched: deepParts.length });
        }

        // ── Build context block: snippets + deep-crawled content ──────────────
        const snippetBlock = `🌐 **Live search results** (retrieved just now  -  ${new Date().toUTCString()}):\n\n${searchResult.text.slice(0, 2000)}`;
        const deepBlock    = deepParts.length > 0
          ? `\n\n📄 **Full page content from top sources** (deep-crawled just now):\n\n${deepParts.join("\n\n---\n\n")}`
          : "";
        const contextBlock = `\n\n---\n${snippetBlock}${deepBlock}\n\n---\n\n` +
          `INSTRUCTIONS: Answer using ONLY the search results and page content above for any fact, figure, date, name, quote, price, or score. ` +
          `Report exactly what the pages above say — do not invent, alter, round, extrapolate, or "fill in" any detail that isn't explicitly present in the text above. ` +
          `If the data above doesn't contain something the user asked for, say plainly that it wasn't found in what you read rather than guessing. ` +
          `If the deep-crawled page content contradicts the search snippet, trust the full page content — it was read directly, just now. ` +
          `General knowledge may only be used to explain or frame the real data, never to replace or supplement a specific fact the data above doesn't support. ` +
          `When referencing sources, cite them by name naturally in your answer (e.g. "According to Wikipedia, ..." or "Reuters reports that ..."). ` +
          `Do NOT use markdown hyperlinks [Title](URL) — cite source names only.`;

        const convo: ChatMessage[] = [...baseConvo];
        const sysIdx = convo.findIndex((m) => m.role === "system");
        if (sysIdx >= 0 && typeof convo[sysIdx].content === "string") {
          convo[sysIdx] = { ...convo[sysIdx], content: (convo[sysIdx].content as string) + contextBlock };
        } else {
          convo.unshift({ role: "system", content: contextBlock });
        }

        // Use the premium chain for search-augmented calls  -  accuracy matters most here
        const result = await callWithFallback(PREMIUM_CHAIN, keys, convo, 4096, requestId);
        if (result.ok) {
          log("info", "search_chat.success", { requestId, provider: result.provider, deepCrawled: deepParts.length });
          // Save to cross-user knowledge base (fire-and-forget — non-blocking)
          if (kbKey.length >= 6) {
            const kbCat = classifyKbQuery(kbQueryRaw);
            saveToKB(db, kbKey, userText, searchResult.text.slice(0, 5000), searchResult.sources, kbCat)
              .catch(() => {});
          }
          return {
            reply: result.content, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
            provider: result.provider, providerModel: result.model,
            searchInfo: { query, sources: searchResult.sources.slice(0, 8) },
            ...(crawledUrls.length && { crawledUrls }),
            ...(crawledSources.length && { crawledSources }),
          };
        }
        log("warn", "search_chat.ai_failed", { requestId, errorDetail: result.errorDetail });
        // Fall through to no-search call below
      } else {
        log("info", "pre_search.no_results", { requestId, text: searchResult.text.slice(0, 80) });
      }
    } catch (err) {
      log("warn", "search_path.exception", { requestId, error: String(err) });
    }
  }

  // No search, or search failed  -  use the model's own chain with the original messages
  const result = await callWithFallback(chain, keys, baseConvo, 4096, requestId);
  if (result.ok) {
    return {
      reply: result.content, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      provider: result.provider, providerModel: result.model,
      ...(crawledUrls.length && { crawledUrls }),
      ...(crawledSources.length && { crawledSources }),
    };
  }

  return {
    reply: "I'm having trouble connecting to the AI service right now. Please try again in a moment.",
    inputTokens: 0, outputTokens: 0,
    ...(crawledUrls.length && { crawledUrls }),
    ...(crawledSources.length && { crawledSources }),
  };
}

// ── Image helpers ─────────────────────────────────────────────────────────────
function isImageGenRequest(messages: IncomingMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return false;
  const text = getTextPreview(lastUser.content).toLowerCase();
  if (IMAGE_GEN_KEYWORDS.some((k) => text.includes(k))) return true;
  if (IMAGE_GEN_PATTERNS.some((p) => p.test(text))) return true;
  return false;
}

function extractImagePrompt(messages: IncomingMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "a beautiful scene";
  const STRIPS = [
    /generate (an? )?(image|picture|photo|illustration|art|logo|drawing|sketch) of /i,
    /create (an? )?(image|picture|photo|illustration|art|logo|drawing|sketch) (of |showing |depicting )?/i,
    /make (me )?(an? )?(image|picture|photo|illustration|art|logo|drawing|sketch) (of |showing |depicting )?/i,
    /draw (me )?(an? )?/i, /illustrate (an? )?/i, /paint (an? )?/i, /sketch (an? )?/i,
    /render (an? )?(image|visual|picture) of /i,
    /show me (an? )?(image|picture|photo|illustration) of /i,
    /design (an? )?(logo|visual|image) (for |of |showing )?/i,
    /can you (draw|paint|sketch|illustrate|render|create|generate|make|design) (me )?(an? )?/i,
    /could you (draw|paint|sketch|illustrate|render|create|generate|make|design) (me )?(an? )?/i,
    /please (draw|paint|sketch|illustrate|create|generate|make|design) (me )?(an? )?/i,
    /i (want|need|'d like) (an? )?(image|picture|photo|drawing|illustration|painting|artwork|visual) of /i,
    /give me (an? )?(image|picture|photo|drawing|illustration|painting|artwork|visual) of /i,
    /(a |an )?(picture|image|photo|drawing|painting|illustration|portrait|artwork|sketch) of /i,
  ];
  let prompt = getTextPreview(lastUser.content).trim();
  for (const re of STRIPS) prompt = prompt.replace(re, "").trim();
  return prompt || getTextPreview(lastUser.content).trim() || "a beautiful scene";
}

async function persistLog(
  db: ReturnType<typeof createClient>,
  logEntry: Record<string,unknown>,
  startTime: number,
): Promise<void> {
  logEntry.latency_ms   = Date.now() - startTime;
  logEntry.total_tokens = (logEntry.input_tokens as number ?? 0) + (logEntry.output_tokens as number ?? 0);
  try { await db.from("engagera_request_logs").insert(logEntry); } catch { /* fire-and-forget */ }
}

// ── API-key traffic: NEVER becomes a Dashboard Chat ────────────────────────
// External developer requests (authenticated via an eng_ API key) must only
// produce API Logs + Dataset Candidates — the API owner never sees the raw
// conversation inside their own Dashboard Chat history.
async function recordApiTraffic(
  db: ReturnType<typeof createClient>,
  opts: {
    apiKeyId: number;
    userId?: string;
    model: string;
    request: string;
    response: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    statusCode?: number;
    errorMessage?: string;
  },
): Promise<void> {
  const totalTokens = opts.inputTokens + opts.outputTokens;
  try {
    await db.from("engagera_api_logs").insert({
      api_key_id: opts.apiKeyId,
      user_id: opts.userId,
      model: opts.model,
      endpoint: "/chat",
      status_code: opts.statusCode ?? 200,
      latency_ms: opts.latencyMs,
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
      total_tokens: totalTokens,
      error_message: opts.errorMessage,
    });
  } catch { /* non-fatal */ }

  if (opts.statusCode && opts.statusCode >= 400) return; // don't dataset-mine errors

  try {
    const hashBuf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${opts.request}\u0000${opts.response}`),
    );
    const contentHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    await db.from("engagera_dataset_candidates").insert({
      request: opts.request.slice(0, 8000),
      response: opts.response.slice(0, 16000),
      model: opts.model,
      api_key_id: opts.apiKeyId,
      content_hash: contentHash,
      reviewer_status: "pending",
    });
  } catch { /* non-fatal */ }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")   return json({ error: "Method not allowed" }, 405);

  const requestId = `eng_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const startTime = Date.now();

  const logEntry: Record<string,unknown> = {
    request_id: requestId, model: "engagera-2.0", path: "chat",
    success: false, error_code: null, latency_ms: 0,
    input_tokens: 0, output_tokens: 0, total_tokens: 0,
  };

  try {
    const supabaseUrl  = Deno.env.get("SUPABASE_URL");
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Provider keys  -  all optional except at least one must be present
    const keys: ProviderKeys = {
      groq:       Deno.env.get("GROQ_API_KEY")       || undefined,
      openai:     Deno.env.get("OPENAI_API_KEY")     || undefined,
      deepseek:   Deno.env.get("DEEPSEEK_API_KEY")   || undefined,
      openrouter: Deno.env.get("OPENROUTER_API_KEY") || undefined,
      gemini:     Deno.env.get("GEMINI_API_KEY")      || undefined,
      cloudflare: Deno.env.get("CLOUDFLARE_API_TOKEN") || undefined,
      cloudflareAccountId: Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || undefined,
      cerebras:   Deno.env.get("CEREBRAS_API_KEY")    || undefined,
    };
    const braveKey     = Deno.env.get("BRAVE_SEARCH_API_KEY");

    if (!supabaseUrl) return json({ error: "SUPABASE_URL not configured" }, 500);
    if (!serviceKey)  return json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, 500);

    const hasAnyKey = Object.values(keys).some(Boolean);
    if (!hasAnyKey)  return json({ error: "No AI provider keys configured" }, 500);

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: Record<string,unknown>;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { messages, model = "engagera-2.0", conversationId, stream = false, contextHint, mode } = body as {
      messages: unknown[];
      model?: string;
      conversationId?: number;
      stream?: boolean;
      contextHint?: string;
      mode?: string;
    };

    logEntry.model = model;

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }
    const validMessages = messages.filter(isValidMessage);
    if (validMessages.length === 0) return json({ error: "No valid messages" }, 400);

    // ── Auth ──────────────────────────────────────────────────────────────────
    let userId: string | undefined;
    let guestSessionId: string | undefined;
    let apiKeyId: number | undefined;
    let keyPausedUntil: string | undefined;

    // Resolve an Engagera developer API key (eng_...) to a userId + apiKeyId.
    // Returns false if the key is not found or revoked (caller should 401).
    async function resolveEngKey(raw: string): Promise<boolean> {
      const buf  = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
      const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      const { data: keyRow, error: keyErr } = await db
        .from("engagera_api_keys")
        .select("id, user_id, is_active, paused_until")
        .eq("key_hash", hash)
        .maybeSingle();
      if (keyErr) {
        log("warn", "auth.api_key_lookup_failed", { requestId, error: keyErr.message });
        return false;
      }
      if (!keyRow || !keyRow.is_active) return false;
      if (keyRow.paused_until && new Date(keyRow.paused_until as string) > new Date()) {
        keyPausedUntil = keyRow.paused_until as string;
        return false;
      }
      userId   = keyRow.user_id as string;
      apiKeyId = keyRow.id as number;
      return true;
    }

    // Path 1: API-server proxy forwards the eng_ key in x-engagera-api-key so
    // the Supabase gateway (which only accepts valid JWTs as Bearer) doesn't
    // reject the request before the Edge Function even runs.
    const customKey = req.headers.get("x-engagera-api-key");
    if (customKey?.startsWith("eng_")) {
      const ok = await resolveEngKey(customKey);
      if (!ok) {
        if (keyPausedUntil) return json({ error: "API key is temporarily paused", pausedUntil: keyPausedUntil }, 403);
        return json({ error: "Invalid or revoked API key" }, 401);
      }
    } else {
      // Path 2: direct call — either a Supabase session JWT or an eng_ key
      // sent as Bearer (works directly now that the gateway's JWT check is
      // disabled for this function — see supabase/config for verify_jwt).
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token   = authHeader.slice(7);
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        if (token && token !== anonKey) {
          if (token.startsWith("eng_")) {
            const ok = await resolveEngKey(token);
            if (!ok) {
              if (keyPausedUntil) return json({ error: "API key is temporarily paused", pausedUntil: keyPausedUntil }, 403);
              return json({ error: "Invalid or revoked API key" }, 401);
            }
          } else {
            // Supabase session JWT
            const { data, error: authErr } = await db.auth.getUser(token);
            userId = data.user?.id;
            if (authErr) log("warn", "auth.jwt_error", { requestId, error: authErr.message });
          }
        }
      }
    }

    let detectedLocation: DetectedLocation | null = null;
    let announceLocation = false;

    if (!userId) {
      guestSessionId = req.headers.get("x-guest-session-id") ?? undefined;
      if (!guestSessionId) return json({ error: "Authentication or guest session required" }, 401);

      const now = new Date();
      const { data: session, error: sessionError } = await db
        .from("engagera_guest_sessions")
        .select("message_count, window_start, detected_timezone, detected_label, detected_country, location_notified")
        .eq("session_id", guestSessionId)
        .maybeSingle();

      if (sessionError) {
        log("error", "guest.session_lookup_failed", { requestId, error: JSON.stringify(sessionError) });
        return json({ error: "Session lookup failed" }, 500);
      }

      if (!session) {
        const ip = getClientIp(req);
        detectedLocation = await geolocateIp(ip, requestId);
        announceLocation = !!detectedLocation;
        const { error: insertError } = await db.from("engagera_guest_sessions").insert({
          session_id: guestSessionId, message_count: 0,
          window_start: now.toISOString(), last_seen_at: now.toISOString(),
          detected_country: detectedLocation?.country ?? null,
          detected_timezone: detectedLocation?.ianaZone ?? null,
          detected_label: detectedLocation?.label ?? null,
          location_notified: announceLocation,
        });
        if (insertError) {
          log("error", "guest.session_create_failed", { requestId, error: JSON.stringify(insertError) });
          return json({ error: "Session create failed" }, 500);
        }
      } else {
        const windowAge = now.getTime() - new Date(session.window_start).getTime();
        if (windowAge >= WINDOW_MS) {
          await db.from("engagera_guest_sessions").update({
            message_count: 0, window_start: now.toISOString(), last_seen_at: now.toISOString(),
          }).eq("session_id", guestSessionId);
        } else if (session.message_count >= GUEST_LIMIT) {
          const resetAt = new Date(new Date(session.window_start).getTime() + WINDOW_MS);
          return json({
            error: "Daily message limit reached. Sign up for unlimited access.",
            windowResetAt: resetAt.toISOString(),
            guestMessageCount: session.message_count,
            guestMessageLimit: GUEST_LIMIT,
          }, 429);
        }

        if (session.detected_timezone) {
          detectedLocation = {
            country: session.detected_country ?? "",
            ianaZone: session.detected_timezone,
            label: session.detected_label ?? session.detected_timezone,
          };
          if (!session.location_notified) {
            announceLocation = true;
            await db.from("engagera_guest_sessions").update({ location_notified: true }).eq("session_id", guestSessionId);
          }
        } else if (session.detected_timezone === null) {
          // Never successfully geolocated this session yet — retry once.
          const ip = getClientIp(req);
          detectedLocation = await geolocateIp(ip, requestId);
          if (detectedLocation) {
            announceLocation = true;
            await db.from("engagera_guest_sessions").update({
              detected_country: detectedLocation.country,
              detected_timezone: detectedLocation.ianaZone,
              detected_label: detectedLocation.label,
              location_notified: true,
            }).eq("session_id", guestSessionId);
          }
        }
      }
    } else {
      // Authenticated users: location is remembered as a durable memory fact,
      // same pattern as other cross-session user memory.
      try {
        const { data: locMem } = await db
          .from("engagera_user_memory")
          .select("value")
          .eq("user_id", userId)
          .eq("key", "location")
          .maybeSingle();
        if (locMem?.value) {
          try {
            const parsed = JSON.parse(locMem.value) as DetectedLocation;
            if (parsed.ianaZone) detectedLocation = parsed;
          } catch { /* legacy plain-text value, ignore */ }
        } else {
          const ip = getClientIp(req);
          detectedLocation = await geolocateIp(ip, requestId);
          if (detectedLocation) {
            announceLocation = true;
            await db.from("engagera_user_memory").insert({
              user_id: userId, key: "location", value: JSON.stringify(detectedLocation), strength: 3,
              updated_at: new Date().toISOString(), created_at: new Date().toISOString(),
            });
          }
        }
      } catch { /* non-fatal */ }
    }

    logEntry.user_id          = userId ?? null;
    logEntry.guest_session_id = guestSessionId ?? null;

    // ── Route: image gen vs agentic chat ──────────────────────────────────────
    const isImageModel     = model === "engagera-image";
    const is21ImageRequest = (model === "engagera-2.1" || model === "engagera-2.0") && isImageGenRequest(validMessages);
    const generateImage    = isImageModel || is21ImageRequest;
    logEntry.path          = generateImage ? "image_gen" : "chat";

    const lastUserMsg   = [...validMessages].reverse().find((m) => m.role === "user");
    const promptPreview = (lastUserMsg ? getTextPreview(lastUserMsg.content) : "").slice(0, 120);
    logEntry.prompt_preview = promptPreview;

    // Detect time query for real-time clock widget on the frontend
    const timeInfo = lastUserMsg ? detectTimeQuery(getTextPreview(lastUserMsg.content), detectedLocation) : null;
    // Detect weather query for the real-time weather widget on the frontend
    const weatherInfo = lastUserMsg
      ? await detectWeatherQuery(getTextPreview(lastUserMsg.content), detectedLocation, requestId)
      : null;

    // First-turn, one-time notice so the user knows we're defaulting to their
    // network-detected location — without ever having asked browser
    // permission. Only fires when we just detected/confirmed it this turn.
    const locationNotice = announceLocation && detectedLocation
      ? `\n\n[System note — mention this naturally once, briefly, only in this reply]: Based on your network connection, you appear to be in ${detectedLocation.label}. I'll use this as your default location for things like "what time is it" unless you tell me otherwise or ask about somewhere else.`
      : "";

    const chain = MODEL_CHAINS[model] ?? DEFAULT_CHAIN;

    log("info", "request.start", {
      requestId, model, path: logEntry.path,
      authed: !!userId, messageCount: validMessages.length,
      providers: chain.map((c) => c.provider).filter((v, i, a) => a.indexOf(v) === i),
    });


    // ── Streaming path ──────────────────────────────────────────────────────────
    if (stream && !generateImage) {
      // Build system prompt + user context (same as normal path)
      let userCtxBlock = "";
      if (userId) {
        try { userCtxBlock = await loadUserContext(db, userId); } catch {}
      }
      const developerSysMsg2 = apiKeyId !== undefined
        ? validMessages.find((m) => m.role === "system")
        : undefined;
      const basePrompt2 = developerSysMsg2
        ? (developerSysMsg2.content as string)
        : (mode === "dev" ? ENGAGERA_DEV_SYSTEM_PROMPT : SYSTEM_PROMPT);
      const timeCtx2 = timeInfo
        ? `\n\n[Current time in ${timeInfo.label}]: ${new Intl.DateTimeFormat("en-US", {
            timeZone: timeInfo.ianaZone,
            weekday: "long", year: "numeric", month: "long", day: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
          }).format(new Date())}`
        : "";
      const weatherCtx2 = weatherInfo
        ? `\n\n[Current weather in ${weatherInfo.label}]: ${weatherInfo.condition}, ${weatherInfo.tempC}°C (feels like ${weatherInfo.feelsLikeC}°C), humidity ${weatherInfo.humidity}%, wind ${weatherInfo.windKph} km/h`
        : "";
      const sysContent2 = developerSysMsg2
        ? basePrompt2
        : [basePrompt2, userCtxBlock, timeCtx2, weatherCtx2, locationNotice,
            contextHint ? `\n\n[Additional user context] ${contextHint}` : ""].join("");

      let streamMsgs: ChatMessage[] = [
        { role: "system", content: sysContent2 },
        ...validMessages.filter((m) => m.role !== "system").map((m) => ({
          role: m.role,
          content: sanitizeContentForModel(
            typeof m.content === "string" ? m.content : getTextPreview(m.content as MessageContent),
          ),
        })),
      ];

      // Auto-crawl URLs mentioned in the user's message (same behaviour as the
      // non-streaming path) so pasted links still get real content + source cards.
      const lastUserText2 = lastUserMsg
        ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content : getTextPreview(lastUserMsg.content as MessageContent))
        : "";
      let streamCrawledUrls: string[] = [];
      let streamCrawledSources: Source[] = [];
      if (lastUserText2) {
        const urls2 = detectURLs(lastUserText2);
        if (urls2.length > 0) {
          try {
            const fetched2 = await Promise.allSettled(urls2.map((u) => afuBotFetch(u).then((result) => ({ url: u, ...result }))));
            const urlParts2: string[] = [];
            for (const r of fetched2) {
              if (r.status === "fulfilled") {
                const { url: rUrl, text, image, pageTitle } = r.value;
                const bad = ["Could not fetch", "Failed to fetch", "Invalid URL", "is not a readable webpage", "not permitted"];
                if (!bad.some((b) => text.startsWith(b))) {
                  urlParts2.push(`### Content from: ${rUrl}\n\n${text}`);
                  streamCrawledUrls.push(rUrl);
                  streamCrawledSources.push({
                    url: rUrl, title: pageTitle || rUrl,
                    snippet: text.replace(/^#[^\n]*\n+/, "").slice(0, 120).trim(),
                    ...(image && { image }),
                  });
                }
              }
            }
            if (urlParts2.length > 0) {
              const crawlBlock2 = `\n\n---\n[LIVE PAGE CONTENT — fetched right now by AfuBot]\n\n${urlParts2.join("\n\n---\n\n")}\n---\n\nINSTRUCTION: You have just browsed the above URL(s) in real-time. Present the content to the user in a clean, well-organised format:\n- Start with the page title and source URL\n- Use headings to separate sections (pricing, features, team, docs, articles, etc.)\n- Use bullet points or numbered lists where appropriate\n- Highlight the most important or interesting information first\n- If the user asked a specific question about the page, answer it directly using the content above\n- Do NOT say you "cannot access" or "cannot browse" — you already have the content above\n- Do NOT dump raw text — always organise and present it cleanly`;
              const si0 = streamMsgs.findIndex((m) => m.role === "system");
              if (si0 >= 0) streamMsgs[si0] = { ...streamMsgs[si0], content: (streamMsgs[si0].content as string) + crawlBlock2 };
            }
          } catch { /* non-fatal */ }
        }
      }

      // Detect if search is needed — actual search runs inside the stream so real-time
      // status events ("Searching the web...", "Verifying...") reach the client while
      // the network request is in-flight, instead of blocking the response start.
      let streamSearchInfo: { query: string; sources: Source[] } | undefined;
      const searchText2 = needsWebSearch(validMessages as IncomingMessage[]);
      let pendingSearchQuery: string | undefined;
      if (searchText2) {
        try {
          const recentCtx2 = validMessages.filter((m) => m.role === "user").slice(-3)
            .map((m) => (typeof m.content === "string" ? m.content : "")).join(" ").slice(0, 120);
          pendingSearchQuery = buildSearchQuery(searchText2, recentCtx2);
        } catch { /* non-fatal */ }
      }

      const encoder2 = new TextEncoder();
      const streamBody = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (obj: object) =>
            controller.enqueue(encoder2.encode(`data: ${JSON.stringify(obj)}\n\n`));

          try {
            // Run the search inside the stream so status events ("Searching the web...",
            // "Verifying current information...") reach the client in real time while
            // the web request is in flight — not after it completes.
            if (pendingSearchQuery) {
              try {
                send({ type: "searchStatus", message: getSearchStatusMessage(pendingSearchQuery) });
                const sr2 = await webSearch(pendingSearchQuery, braveKey);
                if (sr2.sources.length > 0) {
                  send({ type: "searchStatus", message: "Verifying current information..." });
                  const ctxBlk = `\n\n---\n🌐 **Live search results** (retrieved just now):\n\n${sr2.text.slice(0, 2000)}\n---\n\n` +
                    `INSTRUCTIONS: Use ONLY the results above for any fact, figure, date, name, or claim. Report exactly what they say — do not invent, alter, or "fill in" anything not explicitly present. If something asked for isn't in the results, say it wasn't found rather than guessing.`;
                  const si2 = streamMsgs.findIndex((m) => m.role === "system");
                  if (si2 >= 0) streamMsgs[si2] = { ...streamMsgs[si2], content: (streamMsgs[si2].content as string) + ctxBlk };
                  streamSearchInfo = { query: pendingSearchQuery, sources: sr2.sources.slice(0, 8) };
                  send({ type: "meta", searchInfo: streamSearchInfo });
                }
              } catch { /* non-fatal — model answers from its own knowledge */ }
            }

            let fullReply = "";
            let didStream = false;

            // Try OpenAI-compatible providers with real streaming
            const streamChain2 = (MODEL_CHAINS[model] ?? DEFAULT_CHAIN).filter(
              ({ provider }) => provider !== "gemini" && !!keys[provider],
            );

            for (const { provider, model: provModel } of streamChain2) {
              const key2 = keys[provider]!;
              const apiUrl2 = provider === "groq" ? GROQ_API_URL :
                              provider === "openai" ? OPENAI_API_URL :
                              provider === "deepseek" ? DEEPSEEK_API_URL : OPENROUTER_API_URL;
              const extra2 = provider === "openrouter"
                ? { "HTTP-Referer": "https://engagera.afuchat.com", "X-Title": "Engagera" } : undefined;
              try {
                for await (const chunk of callOpenAICompatStream(apiUrl2, key2, provModel, streamMsgs, 4096, requestId, provider, extra2)) {
                  fullReply += chunk;
                  send({ type: "token", content: chunk });
                  didStream = true;
                }
                if (didStream && fullReply) break;
                fullReply = ""; didStream = false;
              } catch { fullReply = ""; didStream = false; }
            }

            // Fallback: non-streaming call, stream word-by-word
            if (!fullReply) {
              const fbResult = await callWithFallback(streamChain2.length ? streamChain2 : DEFAULT_CHAIN, keys, streamMsgs, 4096, requestId);
              fullReply = fbResult.content || "I'm having trouble connecting right now. Please try again.";
              for (const wrd of fullReply.split(/(\s+)/)) {
                if (wrd) send({ type: "token", content: wrd });
              }
            }

            // Persist: API-key traffic -> API Logs + Dataset Candidates only.
            // Dashboard (session) traffic -> Conversation history only.
            let convId2: number | undefined = conversationId;
            const approxIn = Math.ceil(streamMsgs.reduce((a, m) => a + (typeof m.content === "string" ? m.content.length : 0), 0) / 4);
            const approxOut = Math.ceil(fullReply.length / 4);

            if (apiKeyId !== undefined) {
              const reqText = lastUserMsg
                ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content : getTextPreview(lastUserMsg.content as MessageContent))
                : "";
              await recordApiTraffic(db, {
                apiKeyId, userId, model, request: reqText, response: fullReply,
                inputTokens: approxIn, outputTokens: approxOut, latencyMs: Date.now() - startTime,
              });
              await Promise.all([
                db.from("engagera_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKeyId),
                db.rpc("engagera_increment_api_key_requests", { p_key_id: apiKeyId }),
              ]).catch(() => {});
            } else {
              try {
                if (!convId2) {
                  const ins2: Record<string, unknown> = { title: promptPreview.slice(0, 60) || "New conversation", model };
                  if (userId) ins2.user_id = userId; else ins2.guest_session_id = guestSessionId;
                  const { data: cd2 } = await db.from("engagera_conversations").insert(ins2).select("id").single();
                  convId2 = cd2?.id;
                }
                if (convId2) {
                  if (lastUserMsg) {
                    await db.from("engagera_messages").insert({
                      conversation_id: convId2, role: "user",
                      content: typeof lastUserMsg.content === "string" ? lastUserMsg.content : getTextPreview(lastUserMsg.content as MessageContent),
                      token_count: 0,
                    });
                  }
                  const streamMetadata: Record<string, unknown> = {};
                  if (streamCrawledSources.length) streamMetadata.sources = streamCrawledSources;
                  else if (streamSearchInfo?.sources?.length) streamMetadata.sources = streamSearchInfo.sources;
                  if (timeInfo) streamMetadata.timeInfo = { ianaZone: timeInfo.ianaZone, label: timeInfo.label };
                  if (weatherInfo) streamMetadata.weatherInfo = weatherInfo;
                  await db.from("engagera_messages").insert({
                    conversation_id: convId2, role: "assistant", content: fullReply,
                    token_count: Math.ceil(fullReply.length / 4),
                    metadata: Object.keys(streamMetadata).length ? streamMetadata : null,
                  });
                  await db.rpc("engagera_increment_message_count", { p_conversation_id: convId2 }).catch(() => {});
                }
              } catch { /* non-fatal */ }

              if (userId) {
                try {
                  await db.from("engagera_usage_records").insert({
                    user_id: userId, model,
                    input_tokens: approxIn, output_tokens: approxOut, total_tokens: approxIn + approxOut,
                  });
                } catch { /* non-fatal */ }
              }
            }
            let streamGuestCount: number | undefined;
            if (guestSessionId) {
              try {
                const { data: gcd } = await db.rpc("engagera_increment_guest_count", { p_session_id: guestSessionId });
                streamGuestCount = typeof gcd === "number" ? gcd : undefined;
              } catch { /* non-fatal */ }
            }

            // Memory extraction (fire-and-forget)
            if (userId && lastUserMsg && fullReply) {
              const umt = typeof lastUserMsg.content === "string" ? lastUserMsg.content : getTextPreview(lastUserMsg.content as MessageContent);
              extractAndSaveMemory(db, userId, umt, fullReply, keys, requestId).catch(() => {});
            }

            send({ type: "done", model, conversationId: convId2,
              ...(streamSearchInfo && { searchInfo: streamSearchInfo }),
              ...(streamCrawledUrls.length && { crawledUrls: streamCrawledUrls }),
              ...(streamCrawledSources.length && { crawledSources: streamCrawledSources }),
              ...(timeInfo && { timeInfo: { ianaZone: timeInfo.ianaZone, label: timeInfo.label } }),
              ...(weatherInfo && { weatherInfo }),
              ...(streamGuestCount !== undefined && {
                guestMessageCount: streamGuestCount, guestMessageLimit: GUEST_LIMIT,
              }) });
            controller.enqueue(encoder2.encode("data: [DONE]\n\n"));
          } catch (streamErr) {
            try {
              controller.enqueue(encoder2.encode(`data: ${JSON.stringify({ type: "error", error: String(streamErr) })}\n\n`));
            } catch {}
          } finally {
            controller.close();
          }
        },
      });

      return new Response(streamBody, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    let reply = "", inputTokens = 0, outputTokens = 0, totalTokens = 0;

    if (generateImage) {
      const imagePrompt = extractImagePrompt(validMessages);

      // Real raster image via Cloudflare Workers AI (Flux Schnell) — free,
      // no billing. Falls back to an AI-drawn SVG (via IMAGE_CHAIN) only if
      // Cloudflare is unavailable or misconfigured, so image gen still works
      // in a degraded form rather than failing outright.
      const cfImage = keys.cloudflare && keys.cloudflareAccountId
        ? await generateRasterImage(keys.cloudflare, keys.cloudflareAccountId, imagePrompt, requestId)
        : { ok: false as const, errorDetail: "cloudflare not configured" };

      if (cfImage.ok) {
        // Alt text must not contain characters that break markdown image
        // syntax ( [ ] ( ) or newlines ) — otherwise the image renders as
        // broken text instead of an <img> in the chat UI.
        const safeAlt = imagePrompt.slice(0, 100).replace(/[\[\]()\r\n]/g, " ").trim() || "Generated image";
        const { applyWatermark } = await import("../_shared/watermark.ts");
        const watermarked = await applyWatermark(cfImage.base64, requestId);
        reply = `![${safeAlt}](data:image/jpeg;base64,${watermarked})`;
      } else {
        log("warn", "image_gen.cloudflare_failed_fallback_svg", { requestId, error: cfImage.errorDetail });
        const svgMsgs: ChatMessage[] = [
          { role: "system", content: IMAGE_SYSTEM_PROMPT },
          { role: "user",   content: imagePrompt },
        ];
        const result = await callWithFallback(IMAGE_CHAIN, keys, svgMsgs, 1500, requestId);
        if (result.ok && (result.content.includes("```svg") || result.content.includes("<svg"))) {
          reply = result.content;
          inputTokens = result.inputTokens; outputTokens = result.outputTokens;
          totalTokens = inputTokens + outputTokens;
        } else {
          reply = "I wasn't able to generate that image right now. Please try again.";
          logEntry.error_code = `image_gen_failed: cloudflare=${cfImage.errorDetail} svg=${result.errorDetail ?? "no svg block"}`;
        }
      }
    } else {
      // Load cross-session user context (memories + recent conv titles) for authed users
      let userContextBlock = "";
      if (userId) {
        userContextBlock = await loadUserContext(db, userId);
      }

      const developerSysMsg = apiKeyId !== undefined
        ? validMessages.find((m) => m.role === "system")
        : undefined;
      const basePrompt = developerSysMsg
        ? (developerSysMsg.content as string)
        : (mode === "dev" ? ENGAGERA_DEV_SYSTEM_PROMPT : SYSTEM_PROMPT);
      // If this is a time query, inject the exact current time in the target timezone
      const timeContext = timeInfo
        ? `\n\n[Current time in ${timeInfo.label}]: ${new Intl.DateTimeFormat("en-US", {
            timeZone: timeInfo.ianaZone,
            weekday: "long", year: "numeric", month: "long", day: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
          }).format(new Date())}`
        : "";
      const weatherContext = weatherInfo
        ? `\n\n[Current weather in ${weatherInfo.label}]: ${weatherInfo.condition}, ${weatherInfo.tempC}°C (feels like ${weatherInfo.feelsLikeC}°C), humidity ${weatherInfo.humidity}%, wind ${weatherInfo.windKph} km/h`
        : "";
      const systemContent = developerSysMsg
        ? basePrompt
        : [
            basePrompt,
            userContextBlock,
            timeContext,
            weatherContext,
            locationNotice,
            contextHint ? `\n\n[Additional user context] ${contextHint}` : "",
          ].join("");

      const chatMsgs: ChatMessage[] = [
        { role: "system", content: systemContent },
        ...validMessages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role:    m.role,
            content: sanitizeContentForModel(
              typeof m.content === "string" ? m.content : getTextPreview(m.content),
            ),
          })),
      ];

      const chatResult = await agenticChat(db, keys, chain, chatMsgs, requestId, braveKey);
      reply        = chatResult.reply;
      inputTokens  = chatResult.inputTokens;
      outputTokens = chatResult.outputTokens;
      totalTokens  = inputTokens + outputTokens;

      if (chatResult.searchInfo) {
        logEntry.search_query   = chatResult.searchInfo.query;
        logEntry.source_count   = chatResult.searchInfo.sources.length;
      }
      if (chatResult.crawledUrls?.length) {
        logEntry.crawled_urls = chatResult.crawledUrls.join(",");
      }

      log("info", "chat.complete", {
        requestId, replyLen: reply.length,
        inputTokens, outputTokens,
        provider: chatResult.provider,
        providerModel: chatResult.providerModel,
        searchQuery: chatResult.searchInfo?.query,
        crawledUrls: chatResult.crawledUrls,
      });

      // Store for response
      (logEntry as any)._searchInfo      = chatResult.searchInfo;
      (logEntry as any)._crawledUrls     = chatResult.crawledUrls;
      (logEntry as any)._crawledSources  = chatResult.crawledSources;

      // Fire-and-forget: extract and save user memories from this exchange
      if (userId && lastUserMsg && reply) {
        const userMsgText = typeof lastUserMsg.content === "string"
          ? lastUserMsg.content : getTextPreview(lastUserMsg.content);
        extractAndSaveMemory(db, userId, userMsgText, reply, keys, requestId).catch(() => {});
      }
    }

    logEntry.input_tokens  = inputTokens;
    logEntry.output_tokens = outputTokens;
    logEntry.total_tokens  = totalTokens;

    // ── Persist: API-key traffic never becomes a Dashboard Chat ────────────────
    let convId: number | undefined = conversationId;

    if (apiKeyId !== undefined) {
      const reqText = lastUserMsg
        ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content : JSON.stringify(lastUserMsg.content))
        : "";
      await recordApiTraffic(db, {
        apiKeyId, userId, model, request: reqText, response: reply,
        inputTokens, outputTokens, latencyMs: Date.now() - startTime,
      });
      try {
        await Promise.all([
          db.from("engagera_api_keys")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", apiKeyId),
          db.rpc("engagera_increment_api_key_requests", { p_key_id: apiKeyId }),
        ]);
      } catch { /* non-fatal */ }
    } else {
      try {
        if (!convId) {
          const insert: Record<string,unknown> = {
            title: promptPreview.slice(0, 60) || "New conversation", model,
          };
          if (userId) insert.user_id = userId;
          else insert.guest_session_id = guestSessionId;
          const { data, error: convErr } = await db.from("engagera_conversations")
            .insert(insert).select("id").single();
          if (convErr) log("warn", "conv.insert_failed", { requestId, error: JSON.stringify(convErr) });
          convId = data?.id;
        } else {
          await db.from("engagera_conversations")
            .update({ updated_at: new Date().toISOString(), model }).eq("id", convId);
        }
        if (convId) {
          // Save user message first (correct chronological order), then assistant reply
          if (lastUserMsg) {
            const userText = typeof lastUserMsg.content === "string"
              ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);
            const { error: userMsgErr } = await db.from("engagera_messages").insert({
              conversation_id: convId, role: "user", content: userText, token_count: 0,
            });
            if (userMsgErr) log("warn", "msg.user_insert_failed", { requestId, convId, error: JSON.stringify(userMsgErr) });
          }
          const persistedSearchInfo = (logEntry as any)._searchInfo as { sources?: unknown[] } | undefined;
          const assistantMetadata: Record<string, unknown> = {};
          if (persistedSearchInfo?.sources?.length) assistantMetadata.sources = persistedSearchInfo.sources;
          if (timeInfo) assistantMetadata.timeInfo = { ianaZone: timeInfo.ianaZone, label: timeInfo.label };
          if (weatherInfo) assistantMetadata.weatherInfo = weatherInfo;

          const [assistantResult, rpcResult] = await Promise.allSettled([
            db.from("engagera_messages").insert({
              conversation_id: convId, role: "assistant", content: reply, token_count: totalTokens,
              metadata: Object.keys(assistantMetadata).length ? assistantMetadata : null,
            }),
            db.rpc("engagera_increment_message_count", { p_conversation_id: convId }),
          ]);
          if (assistantResult.status === "fulfilled" && assistantResult.value?.error) {
            log("warn", "msg.assistant_insert_failed", { requestId, convId, error: JSON.stringify(assistantResult.value.error) });
          }
          if (rpcResult.status === "fulfilled" && rpcResult.value?.error) {
            log("warn", "msg.rpc_failed", { requestId, convId, error: JSON.stringify(rpcResult.value.error) });
          }
        }
      } catch (err) {
        log("warn", "conv.persist_failed", { requestId, error: String(err) });
      }

      if (userId) {
        try {
          await db.from("engagera_usage_records").insert({
            user_id: userId, model,
            input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens,
          });
        } catch { /* non-fatal */ }
      }
    }

    // ── Guest counter ─────────────────────────────────────────────────────────
    let newGuestCount: number | undefined;
    if (guestSessionId) {
      try {
        const { data } = await db.rpc("engagera_increment_guest_count", { p_session_id: guestSessionId });
        newGuestCount = typeof data === "number" ? data : undefined;
      } catch { /* non-fatal */ }
    }

    logEntry.success = true;
    await persistLog(db, logEntry, startTime);

    const searchInfo     = (logEntry as any)._searchInfo     as { query:string; sources:Source[] } | undefined;
    const crawledUrls    = (logEntry as any)._crawledUrls    as string[]  | undefined;
    const crawledSources = (logEntry as any)._crawledSources as Source[]  | undefined;

    return json({
      id: requestId, model,
      message: { role: "assistant", content: reply },
      usage: { inputTokens, outputTokens, totalTokens },
      conversationId: convId,
      ...(searchInfo          && { searchInfo }),
      ...(crawledUrls?.length && { crawledUrls }),
      ...(crawledSources?.length && { crawledSources }),
      ...(timeInfo && { timeInfo }),
      ...(weatherInfo && { weatherInfo }),
      ...(newGuestCount !== undefined && {
        guestMessageCount: newGuestCount, guestMessageLimit: GUEST_LIMIT,
      }),
    });

  } catch (err) {
    log("error", "handler.unhandled", { requestId, error: String(err) });
    return json({ error: "Internal server error" }, 500);
  }
});
