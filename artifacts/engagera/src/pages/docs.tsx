import React, { useState } from "react";
import PublicLayout from "@/components/layout/PublicLayout";
import { useListModels } from "@workspace/api-client-react";
import { Copy, Check, Terminal, Code2 } from "lucide-react";
import { SUPABASE_URL } from "@/lib/supabase";

export default function Docs() {
  const { data: models = [] } = useListModels();

  return (
    <PublicLayout>
      <div className="max-w-5xl mx-auto px-6 py-12 flex items-start gap-12 relative">
        
        {/* Table of Contents (Desktop Sticky) */}
        <div className="hidden lg:block w-64 shrink-0 sticky top-12 space-y-6">
          <div className="text-[10px] uppercase font-mono tracking-widest text-white/40 mb-4">Contents</div>
          <nav className="space-y-3 text-sm">
            <a href="#overview" className="block text-white/60 hover:text-white transition-colors">Overview</a>
            <a href="#authentication" className="block text-white/60 hover:text-white transition-colors">Authentication</a>
            <a href="#models" className="block text-white/60 hover:text-white transition-colors">Models</a>
            <a href="#endpoints" className="block text-white/60 hover:text-white transition-colors">Endpoints</a>
            <div className="pl-4 space-y-3 border-l border-white/10 mt-2">
              <a href="#chat-completion" className="block text-white/60 hover:text-white transition-colors text-xs">Chat Completion</a>
              <a href="#list-models" className="block text-white/60 hover:text-white transition-colors text-xs">List Models</a>
            </div>
            <a href="#errors" className="block text-white/60 hover:text-white transition-colors">Errors</a>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 pb-32">
          <div className="mb-16">
            <h1 className="text-4xl font-semibold tracking-tight mb-4">Engagera API Reference</h1>
            <p className="text-xl text-white/60 font-light leading-relaxed">
              Integrate world-class AI models into your application with a single, OpenAI-compatible API.
            </p>
          </div>

          <section id="overview" className="mb-16 scroll-mt-12">
            <h2 className="text-2xl font-semibold mb-6 border-b border-white/15 pb-2">Overview</h2>
            <p className="text-white/80 leading-relaxed mb-4">
              The Engagera API provides a unified interface to multiple top-tier language models. It is fully compatible with the OpenAI Chat Completions format, meaning you can use existing OpenAI SDKs by simply changing the base URL and API key.
            </p>
            <div className="p-4 bg-white/[0.02] border border-white/10 mb-6 flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <Terminal className="w-4 h-4 text-white/70" />
              </div>
              <div>
                <h4 className="font-medium text-sm mb-1">Base URL</h4>
                <code className="text-xs font-mono text-white/80 select-all">{SUPABASE_URL}/functions/v1</code>
              </div>
            </div>
          </section>

          <section id="authentication" className="mb-16 scroll-mt-12">
            <h2 className="text-2xl font-semibold mb-6 border-b border-white/15 pb-2">Authentication</h2>
            <p className="text-white/80 leading-relaxed mb-4">
              All API requests require an API key to be included in the Authorization header. You can generate API keys in your Dashboard.
            </p>
            <CodeBlock 
              language="http" 
              code={`Authorization: Bearer YOUR_API_KEY`} 
            />
            <p className="text-white/80 leading-relaxed mt-4 text-sm bg-[#1e1e1e] p-4 border-l-2 border-white/40">
              Keep your API keys secret. Do not expose them in client-side code (browsers, mobile apps). Always route requests through your own backend backend.
            </p>
          </section>

          <section id="models" className="mb-16 scroll-mt-12">
            <h2 className="text-2xl font-semibold mb-6 border-b border-white/15 pb-2">Available Models</h2>
            <p className="text-white/80 leading-relaxed mb-6">
              Use these model IDs in your API requests. The platform routes your request to the appropriate underlying provider.
            </p>
            
            <div className="border border-white/15 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] text-white/50 uppercase font-mono border-b border-white/15 bg-white/5 tracking-wider">
                  <tr>
                    <th className="px-6 py-4 font-normal">Model ID</th>
                    <th className="px-6 py-4 font-normal">Name</th>
                    <th className="px-6 py-4 font-normal">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {models.length > 0 ? (
                    models.map(m => (
                      <tr key={m.id} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-4 font-mono text-xs">{m.id}</td>
                        <td className="px-6 py-4 font-medium">{m.name}</td>
                        <td className="px-6 py-4 text-white/60 capitalize">{m.category}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-white/40 text-sm">
                        Models currently unavailable. Default fallback is <code>engagera-pro</code>.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section id="endpoints" className="mb-16 scroll-mt-12">
            <h2 className="text-2xl font-semibold mb-8 border-b border-white/15 pb-2">Endpoints</h2>

            <div id="chat-completion" className="mb-12 scroll-mt-24">
              <div className="flex items-center gap-4 mb-4">
                <span className="px-2 py-1 bg-white text-black text-[10px] font-mono font-bold uppercase tracking-wider">POST</span>
                <h3 className="text-xl font-medium">/chat</h3>
              </div>
              <p className="text-white/80 text-sm mb-6">
                Creates a model response for the given chat conversation. Compatible with OpenAI's <code>/v1/chat/completions</code> endpoint format.
              </p>

              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium mb-3">Request Body</h4>
                  <div className="border border-white/15 overflow-hidden bg-black text-sm">
                    <div className="flex border-b border-white/10">
                      <div className="w-1/3 p-3 font-mono text-white/80 border-r border-white/10 bg-white/[0.02]">model <span className="text-white/40 text-xs ml-2">string</span></div>
                      <div className="w-2/3 p-3 text-white/60">ID of the model to use (e.g. <code>engagera-pro</code>). Required.</div>
                    </div>
                    <div className="flex border-b border-white/10">
                      <div className="w-1/3 p-3 font-mono text-white/80 border-r border-white/10 bg-white/[0.02]">messages <span className="text-white/40 text-xs ml-2">array</span></div>
                      <div className="w-2/3 p-3 text-white/60">A list of messages comprising the conversation so far. Each object requires <code>role</code> (user, assistant, system) and <code>content</code>.</div>
                    </div>
                    <div className="flex">
                      <div className="w-1/3 p-3 font-mono text-white/80 border-r border-white/10 bg-white/[0.02]">stream <span className="text-white/40 text-xs ml-2">boolean</span></div>
                      <div className="w-2/3 p-3 text-white/60">If set, partial message deltas will be sent. <span className="px-1.5 py-0.5 bg-white/10 text-[10px] rounded ml-2">Coming soon</span></div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-3">Example Request</h4>
                  <CodeBlock 
                    language="bash" 
                    code={`curl ${SUPABASE_URL}/functions/v1/chat \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "engagera-pro",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ]
  }'`} 
                  />
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-3">Using OpenAI SDK (Node.js)</h4>
                  <CodeBlock 
                    language="javascript" 
                    code={`import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: '${SUPABASE_URL}/functions/v1', // Point to Engagera
  apiKey: 'YOUR_API_KEY', // Your Engagera API Key
});

async function main() {
  const completion = await openai.chat.completions.create({
    messages: [{ role: 'user', content: 'Say this is a test' }],
    model: 'engagera-pro',
  });

  console.log(completion.choices[0].message.content);
}

main();`} 
                  />
                </div>
                
                <div>
                  <h4 className="text-sm font-medium mb-3">Example Response</h4>
                  <CodeBlock 
                    language="json" 
                    code={`{
  "id": "chatcmpl-123",
  "model": "engagera-pro",
  "message": {
    "role": "assistant",
    "content": "This is a test."
  },
  "usage": {
    "inputTokens": 10,
    "outputTokens": 5,
    "totalTokens": 15
  }
}`} 
                  />
                </div>
              </div>
            </div>

            <div id="list-models" className="mb-12 scroll-mt-24 pt-12 border-t border-white/10">
              <div className="flex items-center gap-4 mb-4">
                <span className="px-2 py-1 bg-white/20 text-white text-[10px] font-mono font-bold uppercase tracking-wider">GET</span>
                <h3 className="text-xl font-medium">/models</h3>
              </div>
              <p className="text-white/80 text-sm mb-6">
                Lists the currently available models, and provides basic information about each one such as the owner and permission.
              </p>
              
              <CodeBlock 
                language="bash" 
                code={`curl ${SUPABASE_URL}/functions/v1/models \\
  -H "Authorization: Bearer YOUR_API_KEY"`} 
              />
            </div>
          </section>

          <section id="errors" className="mb-16 scroll-mt-12">
            <h2 className="text-2xl font-semibold mb-6 border-b border-white/15 pb-2">Errors</h2>
            <p className="text-white/80 leading-relaxed mb-6 text-sm">
              The API uses conventional HTTP response codes to indicate the success or failure of an API request. In general: Codes in the 2xx range indicate success. Codes in the 4xx range indicate an error that failed given the information provided (e.g., a required parameter was omitted, a charge failed, etc.). Codes in the 5xx range indicate an error with our servers.
            </p>
            
            <div className="border border-white/15 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] text-white/50 uppercase font-mono border-b border-white/15 bg-white/5 tracking-wider">
                  <tr>
                    <th className="px-6 py-4 font-normal">Code</th>
                    <th className="px-6 py-4 font-normal">Meaning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4 font-mono text-xs">400</td>
                    <td className="px-6 py-4 text-white/80"><strong className="font-medium text-white block mb-1">Bad Request</strong> The request was unacceptable, often due to missing a required parameter.</td>
                  </tr>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4 font-mono text-xs">401</td>
                    <td className="px-6 py-4 text-white/80"><strong className="font-medium text-white block mb-1">Unauthorized</strong> No valid API key provided.</td>
                  </tr>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4 font-mono text-xs">403</td>
                    <td className="px-6 py-4 text-white/80"><strong className="font-medium text-white block mb-1">Forbidden</strong> API key lacks permissions or guest limit reached.</td>
                  </tr>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4 font-mono text-xs">429</td>
                    <td className="px-6 py-4 text-white/80"><strong className="font-medium text-white block mb-1">Too Many Requests</strong> Rate limit exceeded or account quota exhausted.</td>
                  </tr>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4 font-mono text-xs">500, 502, 503</td>
                    <td className="px-6 py-4 text-white/80"><strong className="font-medium text-white block mb-1">Server Errors</strong> Something went wrong on Engagera's end.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

        </div>
      </div>
    </PublicLayout>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group overflow-hidden rounded-none border border-white/15">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e] border-b border-white/10">
        <span className="text-[10px] text-white/60 font-mono uppercase tracking-wider">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[10px] text-white/50 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-white" />
              <span className="text-white">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          background: "#000000",
          fontSize: "0.85rem",
          lineHeight: "1.6",
          padding: "1rem",
          overflowX: "auto",
          fontFamily: "'JetBrains Mono', 'Menlo', monospace",
          color: "#ffffff",
          whiteSpace: "pre",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
