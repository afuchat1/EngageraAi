import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useListModels } from "@workspace/api-client-react";

export default function Docs() {
  const { data: models } = useListModels();

  return (
    <AppLayout showSidebar={false}>
      <div className="container max-w-4xl mx-auto py-12 px-4 md:px-8">
        <div className="space-y-12">
          
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">Documentation</h1>
            <p className="text-xl text-muted-foreground">
              Everything you need to integrate Engagera into your application.
            </p>
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-semibold tracking-tight border-b pb-2">Quick Start</h2>
            <div className="space-y-4">
              <h3 className="text-lg font-medium">1. Get an API Key</h3>
              <p className="text-muted-foreground">Sign up for an account and navigate to your dashboard to generate a new API key.</p>
              
              <h3 className="text-lg font-medium mt-6">2. Install the SDK</h3>
              <div className="bg-muted p-4 rounded-md font-mono text-sm overflow-x-auto border">
                npm install @engagera/sdk
              </div>
              
              <h3 className="text-lg font-medium mt-6">3. Initialize the Client</h3>
              <div className="bg-muted p-4 rounded-md font-mono text-sm overflow-x-auto border">
                <pre>
{`import { Engagera } from '@engagera/sdk';

const client = new Engagera({
  apiKey: process.env.ENGAGERA_API_KEY
});`}
                </pre>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-semibold tracking-tight border-b pb-2">Available Models</h2>
            <p className="text-muted-foreground mb-4">Engagera provides several models optimized for different use cases.</p>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model ID</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Context Window</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models ? models.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell className="font-mono text-sm font-medium">{model.id}</TableCell>
                      <TableCell className="uppercase text-xs tracking-wider">{model.category}</TableCell>
                      <TableCell>{model.contextWindow.toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{model.description}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading models...</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-semibold tracking-tight border-b pb-2">REST API Reference</h2>
            
            <div className="space-y-4 mt-6">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <span className="bg-green-500/20 text-green-500 px-2 py-1 rounded text-xs font-mono">POST</span>
                <code className="bg-muted px-2 py-1 rounded text-sm">/v1/chat/completions</code>
              </h3>
              <p className="text-muted-foreground text-sm">Creates a model response for the given chat conversation.</p>
              
              <Card className="bg-card">
                <CardContent className="p-0">
                  <div className="bg-muted/50 p-4 border-b">
                    <span className="text-sm font-medium">Request Body</span>
                  </div>
                  <div className="p-4 font-mono text-sm overflow-x-auto text-muted-foreground">
<pre>{`{
  "model": "engagera-pro",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Write a binary search in Rust."
    }
  ],
  "stream": false
}`}</pre>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold tracking-tight border-b pb-2">Rate Limits</h2>
            <p className="text-muted-foreground">
              API requests are subject to rate limiting to ensure platform stability. 
              The default limits are:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li><strong>Lite models:</strong> 1000 requests / minute</li>
              <li><strong>Pro models:</strong> 100 requests / minute</li>
              <li><strong>Reasoning models:</strong> 20 requests / minute</li>
            </ul>
            <p className="text-muted-foreground text-sm mt-4 bg-muted p-4 rounded-md border border-border/50">
              Note: If you exceed these limits, the API will return a <code className="text-foreground bg-background px-1 rounded">429 Too Many Requests</code> status code.
            </p>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
