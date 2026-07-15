/**
 * Engagera Search Edge Function
 *
 * Powers the Lab search engine in the mobile app.
 * Uses Brave Search API (BRAVE_SEARCH_API_KEY already in Supabase env).
 *
 * Routes (all via query params):
 *   ?type=suggest&q=...   → autocomplete suggestions
 *   ?type=web&q=...       → web results
 *   ?type=images&q=...    → image results
 *   ?type=videos&q=...    → video results
 *   ?type=news&q=...      → news results
 *   ?type=finance&q=...   → finance results (news + web with finance context)
 */

const BRAVE_KEY = Deno.env.get("BRAVE_SEARCH_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-guest-session-id",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function brave(endpoint: string, params: Record<string, string>) {
  if (!BRAVE_KEY) throw new Error("BRAVE_SEARCH_API_KEY not configured");
  const url = new URL(`https://api.search.brave.com/res/v1/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": BRAVE_KEY,
    },
  });
  if (!res.ok) throw new Error(`Brave ${endpoint} → HTTP ${res.status}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "web";
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) return json({ error: "Missing q" }, 400);

  try {
    switch (type) {
      case "suggest": {
        const data = await brave("suggest/search", { q, count: "8", rich: "true" });
        // Brave suggest: { results: [{query, score}] }
        const suggestions: string[] = (data?.results ?? [])
          .map((r: Record<string, unknown>) => r.query as string)
          .filter(Boolean)
          .slice(0, 8);
        return json({ suggestions });
      }

      case "images": {
        const data = await brave("images/search", {
          q,
          count: "24",
          safesearch: "moderate",
          search_lang: "en",
        });
        const results = (data?.results ?? []).map((r: Record<string, unknown>) => {
          const thumb = r.thumbnail as Record<string, unknown> | undefined;
          const props = r.properties as Record<string, unknown> | undefined;
          const metaUrl = r.meta_url as Record<string, unknown> | undefined;
          return {
            title: r.title ?? "",
            pageUrl: r.url ?? "",
            src: (props?.url ?? thumb?.src ?? "") as string,
            thumbnail: (thumb?.src ?? "") as string,
            width: props?.width,
            height: props?.height,
            source: (metaUrl?.netloc ?? r.source ?? "") as string,
          };
        }).filter((r: Record<string, unknown>) => r.thumbnail);
        return json({ results });
      }

      case "videos": {
        const data = await brave("videos/search", { q, count: "10", search_lang: "en" });
        const results = (data?.results ?? []).map((r: Record<string, unknown>) => {
          const thumb = r.thumbnail as Record<string, unknown> | undefined;
          const metaUrl = r.meta_url as Record<string, unknown> | undefined;
          const provider = r.provider as Record<string, unknown> | undefined;
          return {
            title: r.title ?? "",
            url: r.url ?? "",
            thumbnail: (thumb?.src ?? "") as string,
            duration: r.duration ?? null,
            publisher: (metaUrl?.netloc ?? provider?.name ?? "") as string,
            age: r.age ?? null,
            description: r.description ?? "",
          };
        }).filter((r: Record<string, unknown>) => r.url);
        return json({ results });
      }

      case "news": {
        const data = await brave("news/search", {
          q,
          count: "15",
          freshness: "pw",
          search_lang: "en",
        });
        const results = (data?.results ?? []).map((r: Record<string, unknown>) => {
          const thumb = r.thumbnail as Record<string, unknown> | undefined;
          const metaUrl = r.meta_url as Record<string, unknown> | undefined;
          return {
            title: r.title ?? "",
            url: r.url ?? "",
            description: r.description ?? "",
            thumbnail: (thumb?.src ?? null) as string | null,
            source: (metaUrl?.netloc ?? "") as string,
            age: r.age ?? null,
          };
        }).filter((r: Record<string, unknown>) => r.url);
        return json({ results });
      }

      case "finance": {
        // Parallel: finance-flavored news + web results
        const [newsData, webData] = await Promise.allSettled([
          brave("news/search", {
            q: `${q} finance stock market`,
            count: "10",
            freshness: "pd",
          }),
          brave("web/search", { q: `${q} stock price market analysis`, count: "6" }),
        ]);
        const news = newsData.status === "fulfilled"
          ? (newsData.value?.results ?? []).map((r: Record<string, unknown>) => {
              const thumb = r.thumbnail as Record<string, unknown> | undefined;
              const metaUrl = r.meta_url as Record<string, unknown> | undefined;
              return {
                kind: "news",
                title: r.title ?? "",
                url: r.url ?? "",
                description: r.description ?? "",
                thumbnail: (thumb?.src ?? null) as string | null,
                source: (metaUrl?.netloc ?? "") as string,
                age: r.age ?? null,
              };
            }).filter((r: Record<string, unknown>) => r.url)
          : [];
        const web = webData.status === "fulfilled"
          ? (webData.value?.web?.results ?? []).map((r: Record<string, unknown>) => {
              let host = "";
              try { host = new URL(r.url as string).hostname; } catch { /**/ }
              return {
                kind: "web",
                title: r.title ?? "",
                url: r.url ?? "",
                description: r.description ?? "",
                source: host,
                age: r.age ?? null,
              };
            }).filter((r: Record<string, unknown>) => r.url)
          : [];
        return json({ results: [...web, ...news] });
      }

      default: {
        // web
        const data = await brave("web/search", { q, count: "10", search_lang: "en" });
        const results = (data?.web?.results ?? []).map((r: Record<string, unknown>) => {
          let host = "";
          try { host = new URL(r.url as string).hostname; } catch { /**/ }
          const thumb = r.thumbnail as Record<string, unknown> | undefined;
          return {
            title: r.title ?? "",
            url: r.url ?? "",
            description: r.description ?? "",
            age: r.age ?? null,
            favicon: `https://www.google.com/s2/favicons?domain=${host}&sz=32`,
            thumbnail: (thumb?.src ?? null) as string | null,
          };
        });
        return json({ results });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    return json({ error: msg }, 500);
  }
});
