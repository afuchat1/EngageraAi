import { useState } from "react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Copy, Check, ChevronDown, ChevronRight, Terminal, Key, Zap, BookOpen, AlertCircle, Layers, Menu, X } from "lucide-react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

const BASE_URL = `${SUPABASE_URL}/functions/v1`;

// ── Code block with copy ──────────────────────────────────────────────────────
function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl overflow-hidden border border-white/10 my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.04] border-b border-white/10">
        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">{language}</span>
        <button
          onClick={() => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
          className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/70 transition-colors"
        >
          {copied ? <><Check className="w-3 h-3" /><span>Copied</span></> : <><Copy className="w-3 h-3" /><span>Copy</span></>}
        </button>
      </div>
      <pre className="p-4 text-[0.78rem] leading-relaxed overflow-x-auto bg-[#0d0d0d] text-white/80" style={{ fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Inline badge ──────────────────────────────────────────────────────────────
function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "post" | "get" | "delete" }) {
  const styles = {
    default: "bg-white/10 text-white/60 border-white/10",
    post: "bg-white text-black border-transparent",
    get: "bg-white/10 text-white/70 border-white/10",
    delete: "bg-white/10 text-white/60 border-white/10",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${styles[variant]}`}>
      {children}
    </span>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 mb-16">
      <div className="flex items-center gap-3 mb-6 pb-3 border-b border-white/10">
        {Icon && <Icon className="w-4 h-4 text-white/40" />}
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ── Param table row ───────────────────────────────────────────────────────────
function Param({ name, type, required, children }: { name: string; type: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 py-3.5 border-b border-white/[0.06] last:border-0">
      <div className="flex items-start gap-2 sm:w-52 shrink-0">
        <code className="text-[12px] font-mono text-white/85">{name}</code>
        {required && <span className="text-[9px] text-white/30 border border-white/15 rounded px-1 py-0.5 uppercase tracking-wide shrink-0 mt-0.5">required</span>}
      </div>
      <div className="flex-1 min-w-0">
        <code className="text-[11px] font-mono text-white/40 mb-1.5 block">{type}</code>
        <p className="text-sm text-white/60 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

// ── Callout ───────────────────────────────────────────────────────────────────
function Callout({ icon: Icon = AlertCircle, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.03] my-4">
      <Icon className="w-4 h-4 text-white/40 shrink-0 mt-0.5" />
      <p className="text-sm text-white/60 leading-relaxed">{children}</p>
    </div>
  );
}

// ── Model card ────────────────────────────────────────────────────────────────
function ModelCard({ id, name, tagline, speed, quality }: { id: string; name: string; tagline: string; speed: number; quality: number }) {
  return (
    <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-medium text-white/90 text-sm">{name}</p>
          <p className="text-white/40 text-xs mt-0.5">{tagline}</p>
        </div>
        <code className="text-[10px] font-mono text-white/35 shrink-0 border border-white/10 rounded px-1.5 py-0.5">{id}</code>
      </div>
      <div className="flex gap-4 mt-3">
        <div className="flex-1">
          <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wide">Speed</p>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-white/60 rounded-full" style={{ width: `${speed}%` }} />
          </div>
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wide">Quality</p>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-white/60 rounded-full" style={{ width: `${quality}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TOC link ──────────────────────────────────────────────────────────────────
function TocLink({ href, children, sub = false }: { href: string; children: React.ReactNode; sub?: boolean }) {
  return (
    <a
      href={href}
      onClick={() => document.querySelector(href)?.scrollIntoView({ behavior: "smooth" })}
      className={`block py-1 transition-colors hover:text-white text-white/45 ${sub ? "pl-4 text-xs" : "text-sm"}`}
    >
      {children}
    </a>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function Tabs({ tabs }: { tabs: { label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="my-4">
      <div className="flex border-b border-white/10 gap-1">
        {tabs.map((t, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`px-3 py-2 text-xs font-mono transition-colors ${active === i ? "text-white border-b border-white -mb-px" : "text-white/35 hover:text-white/60"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{tabs[active].content}</div>
    </div>
  );
}

// ── Main Docs page ─────────────────────────────────────────────────────────────
export default function Docs() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "#overview", label: "Overview" },
    { href: "#quickstart", label: "Quick Start" },
    { href: "#authentication", label: "Authentication" },
    { href: "#models", label: "Models" },
    { href: "#chat", label: "Chat Completion" },
    { href: "#api-keys-endpoint", label: "API Keys" },
    { href: "#usage-endpoint", label: "Usage" },
    { href: "#errors", label: "Errors" },
    { href: "#sdks", label: "SDKs" },
  ];

  return (
    <PublicLayout>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12 relative">

        {/* Mobile TOC toggle */}
        <button
          className="md:hidden flex items-center gap-2 mb-6 px-3 py-2 border border-white/10 rounded-xl text-sm text-white/60 hover:text-white transition-colors"
          onClick={() => setMobileMenuOpen(v => !v)}
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span>Contents</span>
        </button>

        {/* Mobile TOC drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden mb-8 p-4 border border-white/10 rounded-xl bg-white/[0.02]">
            {navLinks.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-sm text-white/50 hover:text-white transition-colors border-b border-white/[0.05] last:border-0">
                {l.label}
              </a>
            ))}
          </div>
        )}

        <div className="flex gap-12">
          {/* Desktop sticky TOC */}
          <aside className="hidden md:block w-52 shrink-0 sticky top-12 self-start h-fit">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/25 mb-4">Contents</p>
            <nav className="space-y-0.5">
              <TocLink href="#overview">Overview</TocLink>
              <TocLink href="#quickstart">Quick Start</TocLink>
              <TocLink href="#authentication">Authentication</TocLink>
              <TocLink href="#models">Models</TocLink>
              <TocLink href="#chat">Chat Completion</TocLink>
              <TocLink href="#chat" sub>Request body</TocLink>
              <TocLink href="#chat-response" sub>Response</TocLink>
              <TocLink href="#chat-examples" sub>Examples</TocLink>
              <TocLink href="#api-keys-endpoint">API Keys</TocLink>
              <TocLink href="#usage-endpoint">Usage</TocLink>
              <TocLink href="#errors">Error Codes</TocLink>
              <TocLink href="#sdks">SDKs</TocLink>
            </nav>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0 max-w-3xl">

            {/* Hero */}
            <div className="mb-14">
              <div className="inline-flex items-center gap-2 px-3 py-1 border border-white/10 rounded-full text-[11px] text-white/40 mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-white/40 inline-block" />
                API Reference · v1
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 leading-tight">
                Engagera<br />Developer API
              </h1>
              <p className="text-lg text-white/50 leading-relaxed max-w-xl">
                Unified access to the world's most powerful AI models through a single clean API — built by AfuAI.
              </p>
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-mono text-white/60 overflow-hidden">
                  <Terminal className="w-3.5 h-3.5 shrink-0 text-white/30" />
                  <span className="truncate select-all">{BASE_URL}</span>
                </div>
              </div>
            </div>

            {/* Overview */}
            <Section id="overview" title="Overview" icon={Layers}>
              <p className="text-white/65 leading-relaxed mb-4 text-[15px]">
                The Engagera API is a unified AI gateway built by AfuAI. A single endpoint, a single API key, and six purpose-built models — your request is intelligently routed to the best underlying provider without you ever needing to configure or manage them.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 mt-6">
                {[
                  { icon: Zap, title: "One API", body: "One endpoint for all models. No juggling between multiple provider SDKs." },
                  { icon: Key, title: "Secure", body: "API keys are hashed at rest. Keys never leave Engagera's servers." },
                  { icon: Layers, title: "Auto-routing", body: "Our router picks the optimal model version and failover automatically." },
                ].map(({ icon: Icon, title, body }) => (
                  <div key={title} className="p-4 border border-white/10 rounded-xl bg-white/[0.02]">
                    <Icon className="w-4 h-4 text-white/40 mb-3" />
                    <p className="text-sm font-semibold mb-1">{title}</p>
                    <p className="text-xs text-white/45 leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Quick Start */}
            <Section id="quickstart" title="Quick Start" icon={Zap}>
              <p className="text-white/60 mb-6 text-sm leading-relaxed">
                From zero to your first AI response in under two minutes.
              </p>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-none w-7 h-7 rounded-full border border-white/15 flex items-center justify-center text-xs font-bold text-white/50 shrink-0 mt-0.5">1</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm mb-1.5">Get your API key</p>
                    <p className="text-white/50 text-sm mb-3">Sign up, go to <strong className="text-white/70">Dashboard → API Keys</strong>, and create a new key. Your key starts with <code className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">eng_</code>.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-none w-7 h-7 rounded-full border border-white/15 flex items-center justify-center text-xs font-bold text-white/50 shrink-0 mt-0.5">2</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm mb-1.5">Make your first request</p>
                    <CodeBlock language="bash" code={`curl -X POST "${BASE_URL}/chat" \\
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \\
  -H "x-engagera-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "engagera-pro",
    "messages": [
      { "role": "user", "content": "Hello, what can you do?" }
    ]
  }'`} />
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-none w-7 h-7 rounded-full border border-white/15 flex items-center justify-center text-xs font-bold text-white/50 shrink-0 mt-0.5">3</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm mb-1.5">Use the response</p>
                    <CodeBlock language="json" code={`{
  "id": "eng_1783860177654_cj924v",
  "message": {
    "role": "assistant",
    "content": "I'm Engagera, an AI assistant..."
  },
  "model": "engagera-pro",
  "usage": {
    "inputTokens": 20,
    "outputTokens": 45,
    "totalTokens": 65
  }
}`} />
                  </div>
                </div>
              </div>
            </Section>

            {/* Authentication */}
            <Section id="authentication" title="Authentication" icon={Key}>
              <p className="text-white/60 text-sm leading-relaxed mb-5">
                Every request to <code className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">/chat</code> needs <strong className="text-white/70">two</strong> headers: our public anon key in <code className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">Authorization</code> (required by the gateway in front of the API), and your personal key in <code className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">x-engagera-api-key</code>.
              </p>
              <CodeBlock language="http" code={`Authorization: Bearer ${SUPABASE_ANON_KEY}
x-engagera-api-key: eng_your_api_key_here`} />
              <Callout>
                Never expose your personal <code className="font-mono text-[11px]">eng_</code> key in frontend code, mobile apps, or public repositories. Always proxy requests through your own backend server. Rotate keys immediately if compromised — you can do this in the Dashboard.
              </Callout>
              <Callout icon={AlertCircle}>
                <strong className="text-white/80">Known issue:</strong> sending only <code className="font-mono text-[11px]">Authorization: Bearer eng_...</code> (without the anon key above) returns a <code className="font-mono text-[11px]">401 Invalid JWT</code> — the gateway in front of the API rejects it before your key is ever checked. Always send both headers as shown above.
              </Callout>
              <div className="mt-5 rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10">
                  <p className="text-xs font-medium text-white/60">API Key format</p>
                </div>
                <div className="px-4 py-3 font-mono text-sm text-white/75">
                  <span className="text-white/30">eng</span>_<span className="text-white/80">xxxxxxxxxxxxxxxxxxxxxxxxxxxx</span>
                </div>
              </div>
            </Section>

            {/* Models */}
            <Section id="models" title="Models" icon={Layers}>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Six purpose-built models, each optimised for a different workload. All provider details are abstracted — you work with Engagera model IDs only.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <ModelCard id="engagera-lite" name="Engagera Lite" tagline="Fast responses for simple queries" speed={100} quality={55} />
                <ModelCard id="engagera-pro" name="Engagera Pro" tagline="Best all-around model for most tasks" speed={75} quality={85} />
                <ModelCard id="engagera-reason" name="Engagera Reason" tagline="Deep thinking & complex problems" speed={40} quality={98} />
                <ModelCard id="engagera-code" name="Engagera Code" tagline="Code generation, review & debugging" speed={70} quality={92} />
                <ModelCard id="engagera-vision" name="Engagera Vision" tagline="Image understanding & analysis" speed={60} quality={88} />
                <ModelCard id="engagera-voice" name="Engagera Voice" tagline="Conversational & voice-optimised" speed={90} quality={70} />
              </div>
              <p className="text-xs text-white/30 mt-4">
                Not sure which model to use? Start with <code className="font-mono bg-white/10 px-1 py-0.5 rounded">engagera-pro</code>. The Engagera chat auto-selects the best model based on your prompt.
              </p>
            </Section>

            {/* Chat Completion */}
            <Section id="chat" title="Chat Completion" icon={Terminal}>
              <div className="flex items-center gap-3 mb-4">
                <Badge variant="post">POST</Badge>
                <code className="text-sm font-mono text-white/70">/chat</code>
              </div>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Generate a model response for a conversation. This is the primary endpoint for all text generation tasks.
              </p>

              <h3 className="text-sm font-semibold mb-3 text-white/80">Request body</h3>
              <div className="border border-white/10 rounded-xl overflow-hidden mb-8">
                <Param name="messages" type="array" required>
                  Array of message objects forming the conversation history. Each message has a <code className="font-mono text-[11px]">role</code> (<code className="font-mono text-[11px]">"user"</code> | <code className="font-mono text-[11px]">"assistant"</code> | <code className="font-mono text-[11px]">"system"</code>) and a <code className="font-mono text-[11px]">content</code> string.
                </Param>
                <Param name="model" type="string">
                  The Engagera model ID to use. Defaults to <code className="font-mono text-[11px]">engagera-pro</code> if omitted.
                </Param>
              </div>

              <h3 id="chat-response" className="text-sm font-semibold mb-3 scroll-mt-20 text-white/80">Response</h3>
              <div className="border border-white/10 rounded-xl overflow-hidden mb-8">
                <Param name="message" type="object">
                  The assistant's response with <code className="font-mono text-[11px]">role: "assistant"</code> and <code className="font-mono text-[11px]">content</code> string.
                </Param>
                <Param name="model" type="string">
                  The model ID used to generate this response.
                </Param>
                <Param name="usage" type="object">
                  Token usage — <code className="font-mono text-[11px]">inputTokens</code>, <code className="font-mono text-[11px]">outputTokens</code>, <code className="font-mono text-[11px]">totalTokens</code>. Field names are camelCase.
                </Param>
                <Param name="searchInfo" type="object">
                  Present only when the model performed a live web search to answer the prompt. Contains the <code className="font-mono text-[11px]">query</code> used and an array of <code className="font-mono text-[11px]">sources</code> (<code className="font-mono text-[11px]">title</code>, <code className="font-mono text-[11px]">url</code>, <code className="font-mono text-[11px]">snippet</code>).
                </Param>
                <Param name="timeInfo" type="object">
                  Present only when the prompt asked about the current date/time. Contains <code className="font-mono text-[11px]">ianaZone</code> and a human-readable <code className="font-mono text-[11px]">label</code> for the resolved location.
                </Param>
                <Param name="conversationId" type="string">
                  Identifier for the conversation this exchange was saved under. Omitted for guest/anonymous requests.
                </Param>
              </div>
              <Callout>
                Generated images are returned inline as a markdown image with a base64 JPEG data URI in <code className="font-mono text-[11px]">message.content</code>. Raster images include a small Engagera watermark in the bottom-right corner.
              </Callout>

              <h3 id="chat-examples" className="text-sm font-semibold mb-1 scroll-mt-20 text-white/80">Code examples</h3>
              <Tabs tabs={[
                {
                  label: "curl",
                  content: (
                    <CodeBlock language="bash" code={`curl -X POST "${BASE_URL}/chat" \\
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \\
  -H "x-engagera-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "engagera-pro",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Summarise the theory of relativity." }
    ]
  }'`} />
                  )
                },
                {
                  label: "JavaScript",
                  content: (
                    <CodeBlock language="javascript" code={`const response = await fetch("${BASE_URL}/chat", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${SUPABASE_ANON_KEY}",
    "x-engagera-api-key": "YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "engagera-pro",
    messages: [
      { role: "user", content: "Summarise the theory of relativity." }
    ],
  }),
});

const data = await response.json();
console.log(data.message.content);`} />
                  )
                },
                {
                  label: "Python",
                  content: (
                    <CodeBlock language="python" code={`import requests

response = requests.post(
    "${BASE_URL}/chat",
    headers={
        "Authorization": "Bearer ${SUPABASE_ANON_KEY}",
        "x-engagera-api-key": "YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={
        "model": "engagera-pro",
        "messages": [
            {"role": "user", "content": "Summarise the theory of relativity."}
        ],
    },
)

data = response.json()
print(data["message"]["content"])`} />
                  )
                },
              ]} />
            </Section>

            {/* API Keys */}
            <Section id="api-keys-endpoint" title="API Keys" icon={Key}>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Manage your API keys programmatically. All endpoints require a valid session token (obtained from sign-in).
              </p>

              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <Badge variant="get">GET</Badge>
                    <code className="text-sm font-mono text-white/70">/api-keys</code>
                  </div>
                  <p className="text-white/55 text-sm mb-3">List all API keys for the authenticated user.</p>
                  <CodeBlock language="bash" code={`curl "${BASE_URL}/api-keys" \\
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"`} />
                </div>

                <div className="border-t border-white/10 pt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <Badge variant="post">POST</Badge>
                    <code className="text-sm font-mono text-white/70">/api-keys</code>
                  </div>
                  <p className="text-white/55 text-sm mb-3">Create a new API key. The full secret is returned <strong className="text-white/70">only once</strong> — store it securely.</p>
                  <CodeBlock language="bash" code={`curl -X POST "${BASE_URL}/api-keys" \\
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "Production Key" }'`} />
                  <CodeBlock language="json" code={`{
  "id": 42,
  "name": "Production Key",
  "prefix": "eng_a1b2",
  "key": "eng_a1b2c3d4e5f6g7h8i9j0...",
  "createdAt": "2026-07-05T00:00:00Z"
}`} />
                  <Callout icon={AlertCircle}>
                    The full API key is only returned in this response. It is not stored in plaintext and cannot be retrieved again — copy it immediately.
                  </Callout>
                </div>

                <div className="border-t border-white/10 pt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <Badge variant="delete">DELETE</Badge>
                    <code className="text-sm font-mono text-white/70">/api-keys/:id</code>
                  </div>
                  <p className="text-white/55 text-sm mb-3">Revoke and permanently delete an API key by its ID.</p>
                  <CodeBlock language="bash" code={`curl -X DELETE "${BASE_URL}/api-keys/42" \\
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"`} />
                </div>
              </div>
            </Section>

            {/* Usage */}
            <Section id="usage-endpoint" title="Usage" icon={BookOpen}>
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="get">GET</Badge>
                <code className="text-sm font-mono text-white/70">/usage</code>
              </div>
              <p className="text-white/60 text-sm leading-relaxed mb-4">
                Retrieve token usage records for your account. Records are grouped by model and time period.
              </p>
              <CodeBlock language="bash" code={`curl "${BASE_URL}/usage" \\
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"`} />
              <CodeBlock language="json" code={`{
  "records": [
    {
      "id": 1,
      "model": "engagera-pro",
      "promptTokens": 120,
      "completionTokens": 340,
      "totalTokens": 460,
      "createdAt": "2026-07-05T00:00:00Z"
    }
  ],
  "totals": {
    "totalTokens": 460,
    "totalRequests": 1
  }
}`} />
            </Section>

            {/* Errors */}
            <Section id="errors" title="Error Codes" icon={AlertCircle}>
              <p className="text-white/60 text-sm leading-relaxed mb-5">
                All error responses use standard HTTP status codes and return a JSON body with an <code className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">error</code> field.
              </p>
              <CodeBlock language="json" code={`{
  "error": "Unauthorized: missing or invalid API key"
}`} />
              <div className="border border-white/10 rounded-xl overflow-hidden mt-5">
                {[
                  { code: "400", name: "Bad Request", body: "The request body is malformed or missing required fields." },
                  { code: "401", name: "Unauthorized", body: "Your API key is missing, invalid, or has been revoked." },
                  { code: "403", name: "Forbidden", body: "The request is not permitted for your account tier." },
                  { code: "429", name: "Rate Limited", body: "You've exceeded the free message limit. Authenticated users have higher limits." },
                  { code: "500", name: "Server Error", body: "Something went wrong on our end. Retrying after a short delay usually resolves this." },
                  { code: "503", name: "Model Unavailable", body: "All models in the routing chain are temporarily unavailable. Try again shortly." },
                ].map((e, i) => (
                  <div key={i} className="flex gap-4 px-4 py-3.5 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <code className="text-xs font-mono text-white/60 w-10 shrink-0 mt-0.5">{e.code}</code>
                    <div>
                      <p className="text-sm font-medium text-white/80 mb-0.5">{e.name}</p>
                      <p className="text-xs text-white/45 leading-relaxed">{e.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* SDKs */}
            <Section id="sdks" title="SDKs & Helpers" icon={BookOpen}>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Official SDKs are coming soon. In the meantime, here are copy-paste helper modules to get started immediately.
              </p>
              <Tabs tabs={[
                {
                  label: "JavaScript / TypeScript",
                  content: (
                    <CodeBlock language="typescript" code={`// engagera.ts — drop this file into any Node.js or browser project
const BASE = "${BASE_URL}";

interface Message { role: "user" | "assistant" | "system"; content: string; }
interface ChatOptions { model?: string; }

// Public anon key required by the gateway in front of the API — safe to
// hardcode, it is not your secret key.
const ANON_KEY = "${SUPABASE_ANON_KEY}";

export async function chat(
  apiKey: string,
  messages: Message[],
  options: ChatOptions = {}
) {
  const res = await fetch(\`\${BASE}/chat\`, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${ANON_KEY}\`,
      "x-engagera-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      model: options.model ?? "engagera-pro",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? \`HTTP \${res.status}\`);
  }
  return res.json();
}

// Usage:
// const reply = await chat("eng_xxx", [{ role: "user", content: "Hello!" }]);
// console.log(reply.message.content);`} />
                  )
                },
                {
                  label: "Python",
                  content: (
                    <CodeBlock language="python" code={`# engagera.py — drop this file into any Python project
import requests
from typing import Optional

BASE = "${BASE_URL}"

# Public anon key required by the gateway in front of the API — safe to
# hardcode, it is not your secret key.
ANON_KEY = "${SUPABASE_ANON_KEY}"

def chat(
    api_key: str,
    messages: list[dict],
    model: str = "engagera-pro",
) -> dict:
    payload = {"messages": messages, "model": model}
    res = requests.post(
        f"{BASE}/chat",
        headers={
            "Authorization": f"Bearer {ANON_KEY}",
            "x-engagera-api-key": api_key,
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60,
    )
    res.raise_for_status()
    return res.json()

# Usage:
# reply = chat("eng_xxx", [{"role": "user", "content": "Hello!"}])
# print(reply["message"]["content"])`} />
                  )
                },
              ]} />
              <Callout icon={Zap}>
                Want a full SDK with streaming, retries, and TypeScript types?{" "}
                <a href="mailto:dev@afuchat.com" className="underline text-white/70 hover:text-white">Contact us</a> — we're building official SDKs for JavaScript, Python, and Go.
              </Callout>
            </Section>

            {/* Footer */}
            <div className="border-t border-white/10 pt-8 mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Engagera by AfuAI</p>
                <p className="text-xs text-white/30 mt-0.5">The unified AI platform for developers.</p>
              </div>
              <div className="flex gap-4 text-xs text-white/30">
                <a href="/" className="hover:text-white transition-colors">Chat</a>
                <a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a>
                <a href="mailto:dev@afuchat.com" className="hover:text-white transition-colors">Support</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
