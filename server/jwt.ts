import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";

// Generate a secure JWT secret from environment or create one at runtime
// In production, always use a strong JWT_SECRET environment variable
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn("[jwt] JWT_SECRET not set. Generating random secret (sessions will not persist across restarts).");
  return randomBytes(32).toString("hex");
})();

// Session expires when browser closes (no expiration in JWT, cookie is session-only)
const JWT_EXPIRES_IN = "12h"; // Fallback max session duration

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
    // Token invalid or expired
    return undefined;
  }
}

/**
 * Hash a password with SHA-256
 */
export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}
