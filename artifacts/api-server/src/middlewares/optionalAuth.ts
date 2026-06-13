import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";

/**
 * Engagera optional auth middleware.
 *
 * Attaches identity to the request without blocking unauthenticated access.
 * Authenticated users: verified via Supabase JWT → req.userId set.
 * Guest users:         x-guest-session-id header → req.guestSessionId set.
 *
 * Routes that need at least one identity (auth or guest) should check:
 *   if (!req.userId && !req.guestSessionId) return 401
 */
export interface OptionalAuthRequest extends Request {
  userId?: string;
  guestSessionId?: string;
}

export async function optionalAuth(
  req: OptionalAuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (data.user) {
      req.userId = data.user.id;
    }
  }

  if (!req.userId) {
    const raw = req.headers["x-guest-session-id"];
    if (typeof raw === "string" && raw.trim().length > 0) {
      req.guestSessionId = raw.trim();
    }
  }

  next();
}
