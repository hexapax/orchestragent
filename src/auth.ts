import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { Config } from "./config.js";

export function validateToken(
  expected: string | undefined,
  provided: string
): boolean {
  if (!expected || !provided) return false;
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function tokenAuthMiddleware(config: Config) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip auth for health check
    if (req.path === "/health") return next();

    // Skip if no auth configured
    if (!config.auth.token.enabled && !config.auth.oauth.enabled) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing Bearer token" });
      return;
    }

    const token = authHeader.slice(7);

    // Token auth
    if (
      config.auth.token.enabled &&
      validateToken(config.auth.tokenValue, token)
    ) {
      return next();
    }

    // TODO: OAuth token validation will be added in Task 14

    res.status(403).json({ error: "Invalid token" });
  };
}
