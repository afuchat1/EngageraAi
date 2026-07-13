// Builds an immutable JSONL snapshot of all currently-approved Dataset
// Candidates that have not yet been bundled into a version, uploads it to
// the `datasets` Storage bucket, and records it in engagera_dataset_versions.
// Never overwrites a previous version.
//
// POST /dataset-export  (admin only)
import { cors, json } from "../_shared/helpers.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function adminDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const db = adminDb();

  const { data: approved, error } = await db
    .from("engagera_dataset_candidates")
    .select("*")
    .eq("reviewer_status", "approved")
    .is("dataset_version", null);
  if (error) return json({ error: error.message }, 500);

  if (!approved || approved.length === 0) {
    return json({ error: "No newly-approved candidates to export" }, 400);
  }

  const { count: versionCount } = await db
    .from("engagera_dataset_versions")
    .select("id", { count: "exact", head: true });
  const version = `v${(versionCount ?? 0) + 1}`;
  const storagePath = `engagera-dataset-${version}.jsonl`;

  const lines = approved.map((c) => JSON.stringify({
    instruction: c.request,
    input: "",
    output: c.response,
    language: c.language ?? "en",
    category: c.category ?? "general",
    quality_score: c.quality_score,
    source: "engagera_api",
    dataset_version: version,
  }));
  const jsonl = lines.join("\n");

  await db.storage.createBucket("datasets", { public: false }).catch(() => {});
  const { error: uploadErr } = await db.storage
    .from("datasets")
    .upload(storagePath, new Blob([jsonl], { type: "application/jsonl" }), { upsert: false });
  if (uploadErr) return json({ error: uploadErr.message }, 500);

  await db.from("engagera_dataset_versions").insert({
    version, storage_path: storagePath, example_count: approved.length,
  });

  await db.from("engagera_dataset_candidates")
    .update({ dataset_version: version })
    .in("id", approved.map((c) => c.id));

  return json({ version, exampleCount: approved.length, storagePath });
});
