import { Request, Response, NextFunction } from "express";

export interface AuthRequest extends Request {
  userId?: string;
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

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const userId = extractUserIdFromJwt(authHeader.slice(7));
  if (!userId) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.userId = userId;
  next();
}
