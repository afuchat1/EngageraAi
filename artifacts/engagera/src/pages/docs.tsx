import { useState, useEffect, useRef, createContext, useContext } from "react";
import PublicLayout from "@/components/layout/PublicLayout";
import { Copy, Check, ChevronDown, ChevronRight, Terminal, Key, Zap, BookOpen, AlertCircle, Layers, Menu, X } from "lucide-react";
import { SUPABASE_URL } from "@/lib/supabase";

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

// ── Active section context ────────────────────────────────────────────────────
const ActiveSectionCtx = createContext<string>("");

// ── TOC link ──────────────────────────────────────────────────────────────────
function TocLink({ href, children, sub = false }: { href: string; children: React.ReactNode; sub?: boolean }) {
  const activeId = useContext(ActiveSectionCtx);
  const id = href.slice(1); // strip leading #
  const isActive = activeId === id;

  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
        history.replaceState(null, "", href);
      }}
      className={[
        "flex items-center gap-2 py-1 transition-colors duration-150",
        sub ? "pl-4 text-xs" : "text-sm",
        isActive ? "text-white" : "text-white/40 hover:text-white/70",
      ].join(" ")}
    >
      {isActive && (
        <span className="w-0.5 h-3.5 rounded-full bg-white shrink-0 -ml-2" />
      )}
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

// ── All tracked section IDs (order matters — topmost wins) ───────────────────
const SECTION_IDS = [
  "overview", "quickstart", "authentication", "models",
  "afubot", "afubot-search", "afubot-response",
  "chat", "chat-response", "chat-examples",
  "streaming", "streaming-events",
  "api-keys-endpoint", "usage-endpoint", "errors",
  "sdks", "sdk-install", "sdk-afubot", "sdk-chat",
];

// ── Main Docs page ─────────────────────────────────────────────────────────────
export default function Docs() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState("overview");
  const visibleRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleRef.current.add(entry.target.id);
          } else {
            visibleRef.current.delete(entry.target.id);
          }
        });
        // Pick the topmost visible section (first in SECTION_IDS order)
        const next = SECTION_IDS.find((id) => visibleRef.current.has(id));
        if (next) setActiveId(next);
      },
      {
        // Fire when a section's top edge crosses the upper ~30% of the viewport
        rootMargin: "-8% 0px -65% 0px",
        threshold: 0,
      }
    );

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const navLinks = [
    { href: "#overview", label: "Overview" },
    { href: "#quickstart", label: "Quick Start" },
    { href: "#authentication", label: "Authentication" },
    { href: "#models", label: "Models" },
    { href: "#afubot", label: "AfuBot" },
    { href: "#chat", label: "Chat Completion" },
    { href: "#streaming", label: "Streaming" },
    { href: "#api-keys-endpoint", label: "API Keys" },
    { href: "#usage-endpoint", label: "Usage" },
    { href: "#errors", label: "Errors" },
    { href: "#sdks", label: "SDK (@afuchat/sdk)" },
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
            <ActiveSectionCtx.Provider value={activeId}>
            <nav className="space-y-0.5">
              <TocLink href="#overview">Overview</TocLink>
              <TocLink href="#quickstart">Quick Start</TocLink>
              <TocLink href="#authentication">Authentication</TocLink>
              <TocLink href="#models">Models</TocLink>
              <TocLink href="#afubot">AfuBot</TocLink>
              <TocLink href="#afubot-search" sub>search()</TocLink>
              <TocLink href="#afubot-response" sub>Response</TocLink>
              <TocLink href="#chat">Chat Completion</TocLink>
              <TocLink href="#chat" sub>Request body</TocLink>
              <TocLink href="#chat-response" sub>Response</TocLink>
              <TocLink href="#chat-examples" sub>Examples</TocLink>
              <TocLink href="#streaming">Streaming (SSE)</TocLink>
              <TocLink href="#streaming-events" sub>Event types</TocLink>
              <TocLink href="#api-keys-endpoint">API Keys</TocLink>
              <TocLink href="#usage-endpoint">Usage</TocLink>
              <TocLink href="#errors">Error Codes</TocLink>
              <TocLink href="#sdks">SDK · @afuchat/sdk</TocLink>
              <TocLink href="#sdk-install" sub>Installation</TocLink>
              <TocLink href="#sdk-afubot" sub>AfuBot</TocLink>
              <TocLink href="#sdk-chat" sub>Chat</TocLink>
            </nav>
            </ActiveSectionCtx.Provider>
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
  -H "Authorization: Bearer YOUR_API_KEY" \\
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
                All API requests must include your API key as a Bearer token in the <code className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">Authorization</code> header.
              </p>
              <CodeBlock language="http" code={`Authorization: Bearer eng_your_api_key_here`} />
              <Callout>
                Never expose your API key in frontend code, mobile apps, or public repositories. Always proxy requests through your own backend server. Rotate keys immediately if compromised — you can do this in the Dashboard.
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
  -H "Authorization: Bearer YOUR_API_KEY" \\
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
    "Authorization": "Bearer YOUR_API_KEY",
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
        "Authorization": "Bearer YOUR_API_KEY",
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

            {/* AfuBot */}
            <Section id="afubot" title="AfuBot — Web Crawler" icon={Layers}>
              <p className="text-white/60 text-sm leading-relaxed mb-4">
                AfuBot is Engagera's web crawler and spider. It fetches live pages, extracts structured data (titles, og:images, snippets), and synthesises a cited natural-language answer — all synchronously. AfuBot is not a streaming interface; it crawls and returns in one response.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 mb-6">
                {[
                  { title: "Live crawling", body: "Fetches pages in real-time, not from a cached index." },
                  { title: "og:image extraction", body: "Pulls preview images from every crawled page automatically." },
                  { title: "Cited answers", body: "Every answer links back to the exact sources crawled." },
                ].map(({ title, body }) => (
                  <div key={title} className="p-4 border border-white/10 rounded-xl bg-white/[0.02]">
                    <p className="text-sm font-semibold mb-1">{title}</p>
                    <p className="text-xs text-white/45 leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>

              <div id="afubot-search" className="scroll-mt-20">
                <div className="flex items-center gap-3 mb-3">
                  <Badge variant="post">POST</Badge>
                  <code className="text-sm font-mono text-white/70">/chat</code>
                  <span className="text-xs text-white/30 border border-white/10 rounded px-1.5 py-0.5">stream: false</span>
                </div>
                <p className="text-white/55 text-sm mb-4">
                  Send a search query. AfuBot crawls the web and returns a synthesised answer with cited sources. Uses the same <code className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">/chat</code> endpoint — AfuBot activates automatically when the query requires live web data.
                </p>
                <Tabs tabs={[
                  {
                    label: "curl",
                    content: <CodeBlock language="bash" code={`curl -X POST "${BASE_URL}/chat" \\
  -H "x-engagera-api-key: eng_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{ "role": "user", "content": "Latest SpaceX launch results" }],
    "model": "engagera-pro",
    "stream": false
  }'`} />
                  },
                  {
                    label: "TypeScript",
                    content: <CodeBlock language="typescript" code={`// Using @afuchat/sdk (recommended)
import Engagera from "@afuchat/sdk";
const client = new Engagera({ apiKey: "eng_..." });

const result = await client.afubot.search("Latest SpaceX launch results");
console.log(result.answer);
result.sources.forEach(s => console.log(s.title, s.url, s.image));`} />
                  },
                  {
                    label: "Python",
                    content: <CodeBlock language="python" code={`import requests

res = requests.post(
    "${BASE_URL}/chat",
    headers={
        "x-engagera-api-key": "eng_YOUR_KEY",
        "Content-Type": "application/json",
    },
    json={
        "messages": [{"role": "user", "content": "Latest SpaceX launch results"}],
        "model": "engagera-pro",
        "stream": False,
    },
)
data = res.json()
print(data["message"]["content"])
for source in data.get("crawledSources", []):
    print(source["title"], source["url"])`} />
                  },
                ]} />
              </div>

              <div id="afubot-response" className="scroll-mt-20 mt-6">
                <h3 className="text-sm font-semibold mb-3 text-white/80">AfuBot response fields</h3>
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <Param name="message.content" type="string">The synthesised answer incorporating content from crawled pages.</Param>
                  <Param name="crawledSources" type="Source[]">
                    Array of pages AfuBot crawled. Each source has <code className="font-mono text-[11px]">url</code>, <code className="font-mono text-[11px]">title</code>, <code className="font-mono text-[11px]">image</code> (og:image), and <code className="font-mono text-[11px]">snippet</code>.
                  </Param>
                  <Param name="searchInfo" type="object">
                    Contains the internal <code className="font-mono text-[11px]">query</code> AfuBot used and a <code className="font-mono text-[11px]">sources</code> array (may overlap with crawledSources).
                  </Param>
                  <Param name="timeInfo" type="object">Present when the query is time-sensitive. Contains <code className="font-mono text-[11px]">ianaZone</code> and <code className="font-mono text-[11px]">label</code>.</Param>
                </div>
              </div>
            </Section>

            {/* Streaming */}
            <Section id="streaming" title="Streaming (SSE)" icon={Zap}>
              <p className="text-white/60 text-sm leading-relaxed mb-4">
                Set <code className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">stream: true</code> in the request body to receive a <code className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">text/event-stream</code> response. Tokens arrive as they are generated. AfuBot crawling happens first, then the model streams its answer.
              </p>
              <Callout icon={AlertCircle}>
                Streaming is a <strong className="text-white/70">chat-layer feature</strong>. AfuBot itself is synchronous — it crawls first, then the AI streams its answer over SSE.
              </Callout>

              <div id="streaming-events" className="scroll-mt-20 mt-5">
                <h3 className="text-sm font-semibold mb-3 text-white/80">Event types</h3>
                <div className="border border-white/10 rounded-xl overflow-hidden mb-5">
                  {[
                    { event: "meta", payload: '{ "type": "meta", "searchInfo": { "query": "...", "sources": [...] }, "crawledSources": [...] }', desc: "Emitted once AfuBot has finished crawling. Contains all sources with og:images." },
                    { event: "text", payload: '{ "type": "text", "text": "token" }', desc: "One or more tokens from the model. Concatenate these to build the full answer." },
                    { event: "done", payload: '{ "type": "done", "conversationId": "...", "usage": { ... }, "timeInfo": { ... } }', desc: "Stream complete. Contains usage stats and optional timeInfo." },
                    { event: "error", payload: '{ "type": "error", "error": "message" }', desc: "Stream failed. The connection is closed after this event." },
                  ].map((e, i) => (
                    <div key={i} className="px-4 py-3.5 border-b border-white/[0.06] last:border-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <code className="text-xs font-mono text-white/80 border border-white/15 rounded px-1.5 py-0.5">{e.event}</code>
                      </div>
                      <p className="text-xs text-white/45 mb-2 leading-relaxed">{e.desc}</p>
                      <pre className="text-[11px] font-mono text-white/35 overflow-x-auto">{e.payload}</pre>
                    </div>
                  ))}
                </div>
                <Tabs tabs={[
                  {
                    label: "TypeScript",
                    content: <CodeBlock language="typescript" code={`// Using @afuchat/sdk (recommended)
import Engagera from "@afuchat/sdk";
const client = new Engagera({ apiKey: "eng_..." });

for await (const event of client.chat.stream({
  messages: [{ role: "user", content: "Summarise today's AI news" }],
})) {
  if (event.type === "text")    process.stdout.write(event.text);
  if (event.type === "sources") console.log("Sources:", event.sources);
  if (event.type === "done")    console.log("\\nUsage:", event.usage);
}`} />
                  },
                  {
                    label: "curl",
                    content: <CodeBlock language="bash" code={`curl -X POST "${BASE_URL}/chat" \\
  -H "x-engagera-api-key: eng_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Accept: text/event-stream" \\
  -d '{
    "messages": [{ "role": "user", "content": "Summarise today\\'s AI news" }],
    "model": "engagera-pro",
    "stream": true
  }'

# Output:
# data: {"type":"meta","searchInfo":{"query":"...","sources":[...]}}
# data: {"type":"text","text":"Today"}
# data: {"type":"text","text":" in AI"}
# data: {"type":"done","conversationId":"...","usage":{...}}`} />
                  },
                  {
                    label: "JavaScript",
                    content: <CodeBlock language="javascript" code={`const res = await fetch("${BASE_URL}/chat", {
  method: "POST",
  headers: {
    "x-engagera-api-key": "eng_YOUR_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Latest AI news" }],
    stream: true,
  }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  for (const block of buffer.split("\\n\\n")) {
    if (!block.startsWith("data:")) continue;
    const event = JSON.parse(block.slice(5).trim());
    if (event.type === "text") process.stdout.write(event.text);
    if (event.type === "done") console.log("\\n✓ done");
    buffer = "";
  }
}`} />
                  },
                ]} />
              </div>
            </Section>

            {/* SDKs */}
            <Section id="sdks" title="SDK · @afuchat/sdk" icon={BookOpen}>
              <div id="sdk-install" className="scroll-mt-20">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs font-mono text-white/30 border border-white/10 rounded px-2 py-0.5">npm</span>
                  <code className="text-sm font-mono text-white/70">@afuchat/sdk</code>
                  <span className="text-xs text-white/30 border border-white/10 rounded px-1.5 py-0.5">v0.1.0</span>
                </div>
                <p className="text-white/60 text-sm leading-relaxed mb-4">
                  The official TypeScript SDK. Zero dependencies — uses native <code className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">fetch</code>. Works in Node.js 18+, browsers, Cloudflare Workers, Deno, and Bun.
                </p>
                <CodeBlock language="bash" code={`npm install @afuchat/sdk
# or
pnpm add @afuchat/sdk`} />

                <div className="grid sm:grid-cols-2 gap-3 my-5">
                  {[
                    { title: "Full TypeScript", body: "All methods, events, and return types are typed. No any in your code." },
                    { title: "AfuBot first-class", body: "client.afubot.search() — one line to search the live web." },
                    { title: "Async iterators", body: "for await (const event of client.chat.stream()) — native streaming." },
                    { title: "Zero dependencies", body: "Pure fetch. Nothing to audit. Works everywhere." },
                  ].map(({ title, body }) => (
                    <div key={title} className="p-3.5 border border-white/10 rounded-xl bg-white/[0.02]">
                      <p className="text-sm font-medium mb-1">{title}</p>
                      <p className="text-xs text-white/40 leading-relaxed">{body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div id="sdk-afubot" className="scroll-mt-20 mt-8">
                <h3 className="text-sm font-semibold mb-1 text-white/80">AfuBot — crawler</h3>
                <p className="text-white/50 text-xs mb-3">Synchronous. Use this to build search engines.</p>
                <CodeBlock language="typescript" code={`import Engagera from "@afuchat/sdk";

const client = new Engagera({ apiKey: "eng_..." });

// One-shot search
const result = await client.afubot.search("latest AI breakthroughs");

console.log(result.answer);       // synthesised answer
console.log(result.searchQuery);  // query AfuBot used internally
result.sources.forEach(source => {
  console.log(source.title);   // page title
  console.log(source.url);     // source URL
  console.log(source.image);   // og:image (if available)
  console.log(source.snippet); // text preview
});

// With options
const result2 = await client.afubot.search({
  query: "best EVs 2025",
  contextHint: "focus on charging speed",
  conversationId: "abc-123",   // continue a conversation
  model: "engagera-pro",
});`} />
              </div>

              <div id="sdk-chat" className="scroll-mt-20 mt-8">
                <h3 className="text-sm font-semibold mb-1 text-white/80">Chat — AI completions</h3>
                <p className="text-white/50 text-xs mb-3">Streaming and non-streaming. Supports multi-turn conversation.</p>
                <Tabs tabs={[
                  {
                    label: "Non-streaming",
                    content: <CodeBlock language="typescript" code={`const reply = await client.chat.create({
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user",   content: "What happened in tech this week?" },
  ],
  model: "engagera-pro",
});

console.log(reply.content);  // full answer
console.log(reply.sources);  // pages AfuBot crawled (if triggered)
console.log(reply.usage);    // { promptTokens, completionTokens, totalTokens }`} />
                  },
                  {
                    label: "Streaming",
                    content: <CodeBlock language="typescript" code={`for await (const event of client.chat.stream({
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
      console.log("\\n✓", event.usage);
      break;
    case "error":
      console.error(event.message);
      break;
  }
}`} />
                  },
                  {
                    label: "Multi-turn",
                    content: <CodeBlock language="typescript" code={`let conversationId: string | undefined;

async function ask(question: string) {
  const reply = await client.chat.create({
    messages: [{ role: "user", content: question }],
    conversationId,
  });
  conversationId = reply.conversationId;
  return reply.content;
}

await ask("Who won the last World Cup?");
await ask("And the one before that?");  // context maintained`} />
                  },
                  {
                    label: "Error handling",
                    content: <CodeBlock language="typescript" code={`import Engagera, {
  EngageraAuthError,
  EngageraRateLimitError,
  EngageraStreamError,
} from "@afuchat/sdk";

try {
  const result = await client.afubot.search("...");
} catch (err) {
  if (err instanceof EngageraAuthError)
    console.error("Invalid API key");
  if (err instanceof EngageraRateLimitError)
    console.error("Rate limit hit — slow down");
  if (err instanceof EngageraStreamError)
    console.error("Stream broke:", err.message);
}`} />
                  },
                ]} />

                <div className="mt-5 border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10">
                    <p className="text-xs font-medium text-white/60">Client configuration</p>
                  </div>
                  <div className="divide-y divide-white/[0.06]">
                    <Param name="apiKey" type="string" required>Your Engagera API key — starts with <code className="font-mono text-[11px]">eng_</code>.</Param>
                    <Param name="baseUrl" type="string">Override the API base URL. Useful for self-hosted deployments. Defaults to the Engagera production endpoint.</Param>
                    <Param name="defaultModel" type="EngageraModel">Model used when no model is specified per-call. Defaults to <code className="font-mono text-[11px]">engagera-2.0</code>.</Param>
                    <Param name="timeout" type="number">Request timeout in milliseconds. Defaults to <code className="font-mono text-[11px]">120000</code> (2 min).</Param>
                  </div>
                </div>
              </div>
            </Section>

            {/* Footer */}
            <div className="border-t border-white/10 pt-8 mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Engagera by AfuChat</p>
                <p className="text-xs text-white/30 mt-0.5">The unified AI platform for developers.</p>
              </div>
              <div className="flex gap-4 text-xs text-white/30">
                <a href="/" className="hover:text-white transition-colors">Chat</a>
                <a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a>
                <a href="https://www.npmjs.com/package/@afuchat/sdk" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">npm</a>
                <a href="mailto:dev@afuchat.com" className="hover:text-white transition-colors">Support</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
