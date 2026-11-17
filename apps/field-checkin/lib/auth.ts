import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { Campaign, StoreLocation } from "./types";

export const SESSION_COOKIE_NAME = "field_ops_session";
export const BA_SHIFT_COOKIE_NAME = "field_ops_ba_shift";

function getSigningSecret(): string {
  const envSecret = process.env.AUTH_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[SECURITY WARNING] AUTH_SECRET is not set or too short in production! Configure a 32+ byte secret."
    );
  }
  return envSecret || "dev-only-field-ops-hmac-secret-do-not-use-in-prod";
}

export function isHashedPassword(value?: string): boolean {
  if (!value) return false;
  const parts = value.split(":");
  return parts.length === 2 && /^[0-9a-f]{32}$/i.test(parts[0]) && /^[0-9a-f]{128}$/i.test(parts[1]);
}

export function hashPassword(password: string): string {
  const clean = String(password).trim();
  if (isHashedPassword(clean)) return clean;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(clean, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHashOrPlain?: string): boolean {
  if (!storedHashOrPlain || !password) return false;

  // Salted PBKDF2 format (<32-hex-salt>:<128-hex-hash>)
  if (storedHashOrPlain.includes(":")) {
    const [salt, originalHash] = storedHashOrPlain.split(":");
    if (!salt || !originalHash) return false;
    const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
    const testBuf = Buffer.from(testHash);
    const origBuf = Buffer.from(originalHash);
    return testBuf.length === origBuf.length && crypto.timingSafeEqual(testBuf, origBuf);
  }

  // Timing-safe plaintext comparison fallback for legacy records before migration
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(storedHashOrPlain));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface SessionPayload {
  role: "superadmin" | "supervisor" | "ba";
  username: string;
  campaignId?: string;
  storeCode?: string;
  checkInId?: string;
  baName?: string;
  iat?: number;
  exp: number;
}

export function createSessionToken(
  payload: Omit<SessionPayload, "exp" | "iat">,
  ttlSeconds = 60 * 60 * 12
): string {
  const secret = getSigningSecret();
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: nowSec,
    exp: nowSec + ttlSeconds,
  };
  const dataB64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(dataB64).digest("base64url");
  return `${dataB64}.${sig}`;
}

export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [dataB64, sig] = parts;
  if (!dataB64 || !sig) return null;

  const secret = getSigningSecret();
  const expectedSig = crypto.createHmac("sha256", secret).update(dataB64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(dataB64, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies a session token from either Authorization: Bearer <token>
 * or the HttpOnly session cookie (`field_ops_session` / `field_ops_ba_shift`).
 */
export function getRequestSession(
  request: NextRequest,
  allowBaShiftCookie = false
): SessionPayload | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    const verified = verifySessionToken(token);
    if (verified) return verified;
  }

  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) {
    const verified = verifySessionToken(cookieToken);
    if (verified) return verified;
  }

  if (allowBaShiftCookie) {
    const baToken = request.cookies.get(BA_SHIFT_COOKIE_NAME)?.value;
    if (baToken) {
      const verified = verifySessionToken(baToken);
      if (verified) return verified;
    }
  }

  return null;
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  cookieName = SESSION_COOKIE_NAME,
  maxAgeSeconds = 60 * 60 * 12
): void {
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(BA_SHIFT_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ── Sliding-Window Brute-Force Rate Limiter ──
interface RateBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateBucket>();

export function checkRateLimit(
  key: string,
  maxAttempts = 8,
  windowMs = 15 * 60 * 1000
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = rateLimitStore.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (bucket.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "127.0.0.1";
}

/**
 * Computes a hex SHA-256 digest of a string (used for server-side photo evidence hashing).
 */
export function computeSha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Strips all sensitive credentials (adminPassword, adminPin, store.pin, store.baPassword)
 * before sending a Campaign object to an unauthenticated/public BA client.
 */
export function sanitizeCampaignForPublic(campaign: Campaign): Campaign {
  const { adminPassword, adminPin, ...rest } = campaign;
  const safeStores: StoreLocation[] = (campaign.stores || []).map((s) => {
    const { pin, baPassword, ...storeRest } = s;
    return {
      ...storeRest,
      hasPin: Boolean((baPassword && baPassword.trim()) || (pin && pin.trim())),
    };
  });
  return {
    ...rest,
    stores: safeStores,
  };
}
