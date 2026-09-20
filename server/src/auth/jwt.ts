import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface SessionPayload {
  sub: string;
  email: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as SessionPayload;
  } catch {
    return null;
  }
}
