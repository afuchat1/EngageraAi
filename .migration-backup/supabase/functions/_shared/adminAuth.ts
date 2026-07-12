import { adminDb, json } from "./helpers.ts";

/**
 * Requires a valid Supabase session JWT AND membership in engagera_admins.
 * Returns { userId } on success or a Response to short-circuit the handler.
 */
export async function requireAdmin(
  req: Request,
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing or invalid authorization header" }, 401);
  }
  const token = authHeader.slice(7);
  const db = adminDb();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    return json({ error: "Invalid or expired token" }, 401);
  }
  const { data: isAdmin } = await db.rpc("engagera_is_admin", { p_user_id: data.user.id });
  if (!isAdmin) {
    return json({ error: "Admin access required" }, 403);
  }
  return { userId: data.user.id };
}
