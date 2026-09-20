import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { verifySession } from "./jwt.js";

export const SESSION_COOKIE = "session";

export function setSessionCookie(res: Response, token: string): void {
  // Frontend and backend are typically deployed on different origins (e.g.
  // Vercel + Render), so the cookie needs SameSite=None in production for
  // the browser to send it on cross-site API calls — which in turn requires
  // Secure. Locally both run on http://localhost, where SameSite=Lax over
  // plain HTTP is what actually works (browsers reject Secure cookies on
  // non-HTTPS origins).
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export interface AuthedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/**
 * Rejects signed-out visitors before they reach a protected route. Also
 * handles an expired or tampered token explicitly (401 with a structured
 * reason) rather than letting it fall through as an opaque 500.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: { code: "NOT_AUTHENTICATED", message: "Sign in required" } });
    return;
  }
  const payload = verifySession(token);
  if (!payload) {
    res.status(401).json({ error: { code: "SESSION_EXPIRED", message: "Session is invalid or expired" } });
    return;
  }
  req.userId = payload.sub;
  req.userEmail = payload.email;
  next();
}
