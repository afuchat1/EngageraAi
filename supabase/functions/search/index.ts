/**
 * Engagera Search Edge Function
 *
 * Powers the Lab search engine in the mobile app. Aggregates results from
 * free, keyless sources — no API key required, no local Express server:
 *
 *   web        → DuckDuckGo HTML search
 *   images     → Bing image search (HTML)
 *   videos     → YouTube search (HTML)
 *   news       → Bing News RSS + Google News RSS + curated outlet RSS feeds
 *   finance    → the above news pipeline (finance-flavored) + web
 *   suggest    → DuckDuckGo autocomplete
 *   resolve    → bare-domain detection (no network)
 *
 * Routes (all via query params):
 *   ?type=resolve&q=...
 *   ?type=suggest&q=...
 *   ?type=web&q=...
 *   ?type=images&q=...
 *   ?type=videos&q=...
 *   ?type=news&q=...
 *   ?type=finance&q=...
 */
import {
  looksLikeDomain,
  probeDomain,
  fetchSuggestions,
  fetchWebResults,
  fetchImageResults,
  fetchVideoResults,
  fetchNewsResults,
  fetchFinanceResults,
} from "../_shared/search.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function requireUser(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data } = await db.auth.getUser(authHeader.slice(7));
  return !!data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!(await requireUser(req))) return json({ error: "Authentication required" }, 401);

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "web";
  const q = (url.searchParams.get("q") ?? "").trim();

  if (type === "resolve") {
    return json({ domainUrl: looksLikeDomain(q) });
  }

  if (type === "probe") {
    // Network-level probe: checks if a single-word query (e.g. "afuchat")
    // corresponds to a live website (afuchat.com, afuchat.io, …).
    // Returns the first responding URL so the client can pin an "Official site"
    // card at the top of search results, just like Google does.
    if (!q) return json({ url: null });
    const url = await probeDomain(q);
    return json({ url });
  }

  if (!q) return json({ error: "Missing q" }, 400);

  try {
    switch (type) {
      case "suggest": {
        const suggestions = await fetchSuggestions(q);
        return json({ suggestions });
      }
      case "images": {
        const results = await fetchImageResults(q);
        return json({ results });
      }
      case "videos": {
        const results = await fetchVideoResults(q);
        return json({ results });
      }
      case "news": {
        const results = await fetchNewsResults(q);
        return json({ results });
      }
      case "finance": {
        const results = await fetchFinanceResults(q);
        return json({ results });
      }
      default: {
        const results = await fetchWebResults(q);
        return json({ results });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    return json({ error: msg }, 500);
  }
});
