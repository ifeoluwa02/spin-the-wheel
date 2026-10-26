import crypto from "crypto";
import { UserRole, AuthSession, EventItem } from "./types";

const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "passflow-admission-auth-secret-key-2026";

export const SUPER_ADMIN_PIN = process.env.SUPER_ADMIN_PIN || "9999";
export const DEFAULT_ADMIN_PIN = "1234";
export const DEFAULT_USHER_PIN = "0000";

/** Inactivity verification interval: 1 minute (60,000 ms) */
export const PIN_REVERIFY_INTERVAL_MS = 60 * 1000;

export interface TokenPayload {
  role: UserRole;
  eventId?: string;
  eventSlug?: string;
  eventName?: string;
  iat: number;
  exp: number;
}

/**
 * Creates a signed HMAC-SHA256 token
 */
export function createAuthToken(
  data: {
    role: UserRole;
    eventId?: string;
    eventSlug?: string;
    eventName?: string;
  },
  durationMinutes = 60
): string {
  const now = Date.now();
  const payload: TokenPayload = {
    ...data,
    iat: now,
    exp: now + durationMinutes * 60 * 1000,
  };

  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(payloadStr)
    .digest("base64url");

  return `${payloadStr}.${signature}`;
}

/**
 * Verifies signed token
 */
export function verifyAuthToken(token: string): TokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadStr, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(payloadStr)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadStr, "base64url").toString("utf8")
    ) as TokenPayload;
    if (Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Validates entered PIN against event or super-admin role
 */
export function verifyPinForEvent(params: {
  pin: string;
  targetRole: "super-admin" | "admin" | "usher";
  event?: EventItem | null;
}): { valid: boolean; resolvedRole?: UserRole; error?: string } {
  const cleanPin = (params.pin || "").trim();

  if (!cleanPin) {
    return { valid: false, error: "Please enter your security PIN." };
  }

  // Master Super-Admin PIN always unlocks all roles
  if (cleanPin === SUPER_ADMIN_PIN) {
    return { valid: true, resolvedRole: "super-admin" };
  }

  if (params.targetRole === "super-admin") {
    if (cleanPin !== SUPER_ADMIN_PIN) {
      return { valid: false, error: "Invalid Super-Admin PIN." };
    }
    return { valid: true, resolvedRole: "super-admin" };
  }

  const eventAdminPin = params.event?.adminPin?.trim() || DEFAULT_ADMIN_PIN;
  const eventUsherPin = params.event?.usherPin?.trim() || DEFAULT_USHER_PIN;

  if (params.targetRole === "admin") {
    if (cleanPin === eventAdminPin) {
      return { valid: true, resolvedRole: "admin" };
    }
    return { valid: false, error: "Invalid Event Admin PIN." };
  }

  if (params.targetRole === "usher") {
    if (cleanPin === eventUsherPin || cleanPin === eventAdminPin) {
      return { valid: true, resolvedRole: "usher" };
    }
    return { valid: false, error: "Invalid Gate Usher PIN." };
  }

  return { valid: false, error: "Access denied." };
}
