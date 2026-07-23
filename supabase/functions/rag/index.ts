/**
 * Engagera RAG (Knowledge Base) Edge Function
 * 
 * Manages user document uploads and full-text search retrieval.
 * 
 * POST   /rag/upload   — upload a document (text content)
 * GET    /rag          — list documents
 * DELETE /rag/:id      — delete a document and its chunks
 * POST   /rag/search   — search across user's documents
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const CHUNK_SIZE  = 500;  // characters per chunk
const CHUNK_OVERLAP = 50; // overlap between chunks

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Split text into overlapping chunks for RAG retrieval */
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter(c => c.length > 20);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader  = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!bearerToken) return json({ error: "Authentication required" }, 401);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData } = await db.auth.getUser(bearerToken);
  if (!userData.user) return json({ error: "Invalid token" }, 401);
  const userId = userData.user.id;

  const url = new URL(req.url);
  const path = url.pathname;

  // POST /rag/upload — upload a document
  if (req.method === "POST" && path.endsWith("/upload")) {
    let body: { title?: string; content?: string; file_type?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const title   = (body.title ?? "Untitled Document").trim();
    const content = (body.content ?? "").trim();
    const fileType = body.file_type ?? "text";

    if (!content || content.length < 10) return json({ error: "content is too short" }, 400);
    if (content.length > 500_000) return json({ error: "Document too large (max 500K chars)" }, 400);

    // Check user doc limit (max 50 documents)
    const { count } = await db
      .from("engagera_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) >= 50) return json({ error: "Document limit reached (50 max). Delete some to add more." }, 429);

    // Insert document metadata
    const { data: docRow, error: docErr } = await db
      .from("engagera_documents")
      .insert({ user_id: userId, title, file_type: fileType, size_chars: content.length })
      .select().single();

    if (docErr) return json({ error: docErr.message }, 500);

    // Chunk and insert
    const chunks = chunkText(content);
    const chunkRows = chunks.map((chunk_text, chunk_index) => ({
      document_id: docRow.id,
      user_id:     userId,
      chunk_index,
      chunk_text,
    }));

    const { error: chunkErr } = await db.from("engagera_document_chunks").insert(chunkRows);
    if (chunkErr) {
      // Rollback document on chunk failure
      await db.from("engagera_documents").delete().eq("id", docRow.id);
      return json({ error: chunkErr.message }, 500);
    }

    return json({ document: { ...docRow, chunk_count: chunks.length } }, 201);
  }

  // GET /rag — list documents
  if (req.method === "GET") {
    const { data, error } = await db
      .from("engagera_documents")
      .select("id, title, file_type, size_chars, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ documents: data ?? [] });
  }

  // DELETE /rag/:id — delete a document
  if (req.method === "DELETE") {
    const docId = path.split("/").pop();
    if (!docId || isNaN(Number(docId))) return json({ error: "Invalid document ID" }, 400);
    // Chunks will cascade-delete via FK
    const { error } = await db
      .from("engagera_documents")
      .delete()
      .eq("id", docId)
      .eq("user_id", userId);
    if (error) return json({ error: error.message }, 500);
    return json({ deleted: true });
  }

  // POST /rag/search — search documents
  if (req.method === "POST" && path.endsWith("/search")) {
    let body: { query?: string; limit?: number };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.query) return json({ error: "query is required" }, 400);

    const { data, error } = await db.rpc("engagera_search_chunks", {
      p_user_id: userId,
      p_query:   body.query.slice(0, 200),
      p_limit:   Math.min(body.limit ?? 4, 10),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ results: data ?? [] });
  }

  return json({ error: "Not found" }, 404);
});
