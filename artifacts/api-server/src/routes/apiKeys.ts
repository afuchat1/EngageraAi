import { Router } from "express";
import crypto from "crypto";
import { engageraDb } from "../lib/supabase.js";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";

const router = Router();

function generateApiKey(): { key: string; prefix: string; hash: string } {
  const raw = `eng_${crypto.randomBytes(32).toString("hex")}`;
  const prefix = raw.slice(0, 12);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { key: raw, prefix, hash };
}

router.get("/api-keys", requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await engageraDb
    .from("engagera_api_keys")
    .select("id, name, prefix, is_active, total_requests, last_used_at, created_at")
    .eq("user_id", req.userId!)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(
    (data ?? []).map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      isActive: k.is_active,
      totalRequests: k.total_requests,
      lastUsedAt: k.last_used_at,
      createdAt: k.created_at,
    })),
  );
});

router.post("/api-keys", requireAuth, async (req: AuthRequest, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const { key, prefix, hash } = generateApiKey();

  const { data, error } = await engageraDb
    .from("engagera_api_keys")
    .insert({
      user_id: req.userId!,
      name: name.trim(),
      key_hash: hash,
      prefix,
      is_active: true,
    })
    .select("id, name, prefix, is_active, created_at")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json({
    id: data.id,
    name: data.name,
    prefix: data.prefix,
    key,
    isActive: data.is_active,
    createdAt: data.created_at,
  });
});

router.delete("/api-keys/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { error } = await engageraDb
    .from("engagera_api_keys")
    .update({ is_active: false })
    .eq("id", id)
    .eq("user_id", req.userId!);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true, message: "API key revoked" });
});

export default router;
