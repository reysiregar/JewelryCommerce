import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn("[jwt] JWT_SECRET not set. Generating random secret (sessions will not persist across restarts).");
  return randomBytes(32).toString("hex");
})();

const JWT_EXPIRES_IN = "1h";

export interface SessionPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

/**
 * Sign a JWT token with the user's session data
 */
export function signToken(userId: string): string {
  const payload: SessionPayload = { userId };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 * Returns the payload if valid, or undefined if invalid/expired
 */
export function verifyToken(token: string): SessionPayload | undefined {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SessionPayload;
    return decoded;
  } catch (error) {
    return undefined;
  }
}

/**
 * Hash a password with SHA-256
 */
export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}
