import { Request, Response, NextFunction } from "express";

export interface OptionalAuthRequest extends Request {
  userId?: string;
  guestSessionId?: string;
}

function extractUserIdFromJwt(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded.sub === "string" ? decoded.sub : undefined;
  } catch {
    return undefined;
  }
}

export async function optionalAuth(
  req: OptionalAuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    req.userId = extractUserIdFromJwt(token);
  }

  if (!req.userId) {
    const raw = req.headers["x-guest-session-id"];
    if (typeof raw === "string" && raw.trim().length > 0) {
      req.guestSessionId = raw.trim();
    }
  }

  next();
}
