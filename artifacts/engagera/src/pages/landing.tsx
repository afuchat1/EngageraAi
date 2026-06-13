import React from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useListModels } from "@workspace/api-client-react";
import { SiDependabot } from "react-icons/si";
import { Terminal, Code, Cpu, Shield, Zap, BookOpen } from "lucide-react";

export default function Landing() {
  const { data: models } = useListModels();

  return (
    <AppLayout>
      <div className="flex flex-col min-h-screen">
        <section className="relative overflow-hidden pt-24 pb-32 border-b">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
          <div className="container px-4 md:px-6 relative z-10 mx-auto max-w-6xl">
            <div className="flex flex-col items-center text-center space-y-8">
              <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <SparklesIcon className="mr-2 h-4 w-4" />
                Engagera API is now generally available
              </div>
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl">
                The Unified <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-400">
                  AI Control Center
                </span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl">
                One API key. Six state-of-the-art models. Built for engineers who need precision, performance, and uncompromised control over their AI infrastructure.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link href="/sign-up">
                  <Button size="lg" className="h-12 px-8 text-base font-semibold">
                    Get API Key
                  </Button>
                </Link>
                <Link href="/docs">
                  <Button size="lg" variant="outline" className="h-12 px-8 text-base bg-background/50 backdrop-blur">
                    Read the Docs
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 bg-card/30">
          <div className="container px-4 md:px-6 mx-auto max-w-6xl">
            <div className="mb-16">
              <h2 className="text-3xl font-bold tracking-tight mb-4">The Engagera Fleet</h2>
              <p className="text-muted-foreground max-w-2xl text-lg">
                Access AfuAI's complete suite of specialized models through a single, unified endpoint.
              </p>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {models?.map((model) => (
                <Card key={model.id} className="bg-background/50 border-border/50 hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <div className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-mono font-medium uppercase tracking-wider">
                        {model.category}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {model.contextWindow / 1000}k context
                      </div>
                    </div>
                    <CardTitle className="text-xl">{model.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{model.description}</p>
                  </CardContent>
                </Card>
              ))}
              {!models && Array(6).fill(0).map((_, i) => (
                <Card key={i} className="bg-background/50 border-border/50 animate-pulse">
                  <CardHeader><div className="h-6 bg-muted rounded w-1/3 mb-2"></div><div className="h-6 bg-muted rounded w-2/3"></div></CardHeader>
                  <CardContent><div className="h-10 bg-muted rounded w-full"></div></CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 border-t">
          <div className="container px-4 md:px-6 mx-auto max-w-6xl">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div className="space-y-8">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Built for Developers</h2>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="mt-1 bg-primary/10 p-2 rounded-lg h-fit">
                      <Terminal className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Drop-in replacement</h3>
                      <p className="text-muted-foreground mt-1">OpenAI-compatible endpoints mean you can switch to Engagera by changing just two lines of code.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="mt-1 bg-primary/10 p-2 rounded-lg h-fit">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Low latency inference</h3>
                      <p className="text-muted-foreground mt-1">Engineered for real-time applications with aggressive KV caching and optimized routing.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="mt-1 bg-primary/10 p-2 rounded-lg h-fit">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Enterprise control</h3>
                      <p className="text-muted-foreground mt-1">Granular key management, exact usage tracking, and predictable billing.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-card text-card-foreground shadow-2xl overflow-hidden">
                <div className="flex items-center px-4 py-3 border-b bg-muted/50">
                  <div className="flex space-x-2">
                    <div className="h-3 w-3 rounded-full bg-red-500/80"></div>
                    <div className="h-3 w-3 rounded-full bg-yellow-500/80"></div>
                    <div className="h-3 w-3 rounded-full bg-green-500/80"></div>
                  </div>
                  <div className="mx-auto text-xs font-mono text-muted-foreground">app.ts</div>
                </div>
                <div className="p-4 overflow-x-auto">
                  <pre className="text-sm font-mono text-muted-foreground">
                    <code>
                      <span className="text-emerald-400">import</span> {`{ Engagera }`} <span className="text-emerald-400">from</span> <span className="text-yellow-300">'@engagera/sdk'</span>;{'\n\n'}
                      <span className="text-emerald-400">const</span> ai = <span className="text-emerald-400">new</span> Engagera({'{'}{'\n'}
                      {'  '}apiKey: process.env.<span className="text-blue-400">ENGAGERA_API_KEY</span>{'\n'}
                      {'}'});{'\n\n'}
                      <span className="text-emerald-400">const</span> response = <span className="text-emerald-400">await</span> ai.chat.completions.create({'{'}{'\n'}
                      {'  '}model: <span className="text-yellow-300">'engagera-pro'</span>,{'\n'}
                      {'  '}messages: [{'{'} role: <span className="text-yellow-300">'user'</span>, content: <span className="text-yellow-300">'Hello world'</span> {'}'}]{'\n'}
                      {'}'});
                    </code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        <footer className="border-t py-12 bg-muted/20">
          <div className="container px-4 md:px-6 mx-auto max-w-6xl flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0 text-muted-foreground">
              <SiDependabot className="h-5 w-5" />
              <span className="font-semibold tracking-tight">Engagera</span>
              <span className="text-sm border-l pl-2 ml-2">by AfuAI</span>
            </div>
            <div className="flex space-x-6 text-sm text-muted-foreground">
              <Link href="/docs" className="hover:text-foreground transition-colors">Documentation</Link>
              <span className="cursor-not-allowed opacity-50">Status</span>
              <span className="cursor-not-allowed opacity-50">Terms</span>
            </div>
          </div>
        </footer>
      </div>
    </AppLayout>
  );
}

function SparklesIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  )
}
