import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useListModels } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

function CodeBlock({ children, language }: { children: string; language?: string }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {language && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
          <span className="text-xs font-mono text-muted-foreground">{language}</span>
        </div>
      )}
      <pre className="bg-[hsl(var(--card))] px-4 py-4 text-sm font-mono overflow-x-auto text-foreground/90 leading-relaxed scrollbar-thin">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-bold tracking-tight mb-6 pb-3 border-b border-border">{title}</h2>
      {children}
    </section>
  );
}

export default function Docs() {
  const { data: models } = useListModels();

  return (
    <AppLayout showSidebar={false}>
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-12 md:py-16">

          {/* Hero */}
          <div className="mb-16">
            <div className="flex items-center gap-2 mb-6">
              <img src="/logo.png" alt="Engagera" className="h-8 w-8 object-contain" />
              <span className="text-sm text-muted-foreground font-medium">Documentation</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 leading-none">
              Build with<br />Engagera
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              One API key. Every AI model. No infrastructure to manage.
            </p>
            <div className="flex items-center gap-4 mt-6">
              <Link href="/sign-up">
                <button className="flex items-center gap-2 text-sm font-semibold bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
                  Get API Key <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </Link>
              <a href="#quickstart" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Quick start →
              </a>
            </div>
          </div>

          <div className="space-y-16">

            {/* Quick Start */}
            <Section id="quickstart" title="Quick Start">
              <div className="space-y-8">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold bg-foreground text-background px-2 py-0.5 rounded-full">1</span>
                    <h3 className="text-sm font-semibold">Get your API key</h3>
                  </div>
                  <p className="text-sm text-muted-foreground pl-7">
                    <Link href="/sign-up">
                      <span className="text-foreground hover:underline underline-offset-4 cursor-pointer">Create an account</span>
                    </Link>{" "}
                    and navigate to your dashboard to generate an API key.
                    Keys are stored hashed — only shown once, so copy it immediately.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold bg-foreground text-background px-2 py-0.5 rounded-full">2</span>
                    <h3 className="text-sm font-semibold">Make your first request</h3>
                  </div>
                  <div className="pl-7 space-y-3">
                    <CodeBlock language="bash">{`curl https://your-domain.com/api/v1/chat/completions \\
  -H "Authorization: Bearer eng_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "engagera-pro",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}</CodeBlock>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold bg-foreground text-background px-2 py-0.5 rounded-full">3</span>
                    <h3 className="text-sm font-semibold">Use an OpenAI-compatible SDK</h3>
                  </div>
                  <div className="pl-7 space-y-3">
                    <CodeBlock language="javascript">{`import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.ENGAGERA_API_KEY,
  baseURL: 'https://your-domain.com/api/v1',
});

const response = await client.chat.completions.create({
  model: 'engagera-pro',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(response.choices[0].message.content);`}</CodeBlock>
                    <CodeBlock language="python">{`from openai import OpenAI

client = OpenAI(
    api_key=os.environ["ENGAGERA_API_KEY"],
    base_url="https://your-domain.com/api/v1",
)

response = client.chat.completions.create(
    model="engagera-pro",
    messages=[{"role": "user", "content": "Hello!"}],
)

print(response.choices[0].message.content)`}</CodeBlock>
                  </div>
                </div>
              </div>
            </Section>

            {/* Models */}
            <Section id="models" title="Available Models">
              <p className="text-sm text-muted-foreground mb-6">
                Engagera provides branded model IDs that route to best-in-class underlying models.
                Provider details are never exposed to clients.
              </p>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-xs text-muted-foreground">Model ID</TableHead>
                      <TableHead className="text-xs text-muted-foreground">Category</TableHead>
                      <TableHead className="text-xs text-muted-foreground hidden md:table-cell">Context</TableHead>
                      <TableHead className="text-xs text-muted-foreground hidden lg:table-cell">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(models) ? models.map((model) => (
                      <TableRow key={model.id} className="border-border">
                        <TableCell>
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{model.id}</code>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{model.category}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell font-mono">
                          {model.contextWindow.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell max-w-xs truncate">
                          {model.description}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                          Loading models…
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Section>

            {/* API Reference */}
            <Section id="api" title="API Reference">
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold bg-foreground text-background px-2 py-1 rounded">POST</span>
                    <code className="text-sm font-mono text-foreground/90">/api/v1/chat/completions</code>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Creates a chat completion. OpenAI-compatible format — drop-in replacement for existing integrations.
                  </p>
                  <CodeBlock language="json">{`{
  "model": "engagera-pro",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user",   "content": "Explain async/await in JavaScript." }
  ]
}`}</CodeBlock>
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Response</h4>
                    <CodeBlock language="json">{`{
  "message": { "role": "assistant", "content": "..." },
  "usage": {
    "inputTokens": 42,
    "outputTokens": 128,
    "totalTokens": 170
  },
  "conversationId": 1234
}`}</CodeBlock>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold bg-foreground text-background px-2 py-1 rounded">GET</span>
                    <code className="text-sm font-mono text-foreground/90">/api/models</code>
                  </div>
                  <p className="text-sm text-muted-foreground">Returns available models. No authentication required.</p>
                </div>
              </div>
            </Section>

            {/* Auth */}
            <Section id="authentication" title="Authentication">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  All API requests (except <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">/api/models</code> and{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">/api/healthz</code>) require authentication.
                  Pass your API key in the <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">Authorization</code> header.
                </p>
                <CodeBlock language="bash">{`Authorization: Bearer eng_your_api_key_here`}</CodeBlock>
                <div className="rounded-lg border border-border bg-card p-4 text-sm">
                  <p className="font-semibold mb-1">Security note</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    API keys are stored as SHA-256 hashes in Supabase. Only the prefix is stored in plaintext for identification.
                    The full key is shown exactly once on creation — store it in a password manager or secret manager immediately.
                  </p>
                </div>
              </div>
            </Section>

            {/* Rate Limits */}
            <Section id="rate-limits" title="Rate Limits">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Requests exceeding the limit receive a{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">429 Too Many Requests</code> response.
                </p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-card">
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 uppercase tracking-wider">Tier</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 uppercase tracking-wider">Models</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 uppercase tracking-wider">Limit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { tier: "Lite", models: "engagera-lite", limit: "1,000 req/min" },
                        { tier: "Pro", models: "engagera-pro, engagera-code, engagera-vision", limit: "100 req/min" },
                        { tier: "Reasoning", models: "engagera-reason", limit: "20 req/min" },
                      ].map((row) => (
                        <tr key={row.tier} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium">{row.tier}</td>
                          <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{row.models}</td>
                          <td className="px-4 py-3 text-right font-mono text-sm">{row.limit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Section>

          </div>

          <div className="mt-20 pt-8 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Engagera" className="h-5 w-5 object-contain opacity-40" />
              <span className="text-xs text-muted-foreground/50 font-medium">Engagera Platform</span>
            </div>
            <Link href="/sign-up">
              <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Get started →
              </button>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
