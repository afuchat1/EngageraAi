/**
 * Engagera Settings Edge Function
 * 
 * GET  /settings — fetch user settings
 * POST /settings — upsert user settings
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
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

  if (req.method === "GET") {
    const { data } = await db
      .from("engagera_user_settings")
      .select("custom_system_prompt, preferred_model, preferred_voice, agent_mode_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    return json({
      settings: data ?? {
        custom_system_prompt: "",
        preferred_model:      "engagera-pro",
        preferred_voice:      "nova",
        agent_mode_enabled:   false,
      },
    });
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const { error } = await db.rpc("engagera_upsert_settings", {
      p_user_id:              userId,
      p_custom_system_prompt: body.custom_system_prompt as string ?? null,
      p_preferred_model:      body.preferred_model      as string ?? null,
      p_preferred_voice:      body.preferred_voice      as string ?? null,
      p_agent_mode_enabled:   body.agent_mode_enabled   as boolean ?? null,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ saved: true });
  }

  return json({ error: "Method not allowed" }, 405);
});
