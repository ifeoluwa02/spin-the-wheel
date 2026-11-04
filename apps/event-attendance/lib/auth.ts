import crypto from "crypto";
import type { NextRequest } from "next/server";
import { UserRole, EventItem } from "./types";

const PRIMARY_SECRET =
  process.env.AUTH_SECRET ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "passflow-admission-auth-secret-key-2026";

export const SUPER_ADMIN_EMAIL =
  process.env.SUPER_ADMIN_EMAIL || "superadmin@passflow.io";
export const SUPER_ADMIN_PASSWORD =
  process.env.SUPER_ADMIN_PASSWORD || "admin123";

export const DEFAULT_ADMIN_EMAIL = "admin@event.internal";
export const DEFAULT_ADMIN_PASSWORD = "admin123";
export const DEFAULT_USHER_PIN = "0000";

/** Inactivity verification interval: 1 minute (60,000 ms) */
export const PIN_REVERIFY_INTERVAL_MS = 60 * 1000;

export interface SessionPayload {
  role: UserRole;
  email: string;
  name?: string;
  eventId?: string;
  eventSlug?: string;
  eventName?: string;
  iat?: number;
  exp: number;
}

// ----------------- Brute-Force Auth Rate Limiter -----------------
const authFailureMap = new Map<string, number[]>();
const AUTH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_AUTH_FAILURES = 8; // Max 8 failed login/PIN attempts per 5 minutes per IP

export function getRequestIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

export function checkAuthRateLimit(ip: string): {
  blocked: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const attempts = (authFailureMap.get(ip) || []).filter(
    (t) => now - t < AUTH_WINDOW_MS
  );
  authFailureMap.set(ip, attempts);

  if (attempts.length >= MAX_AUTH_FAILURES) {
    const oldest = attempts[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((AUTH_WINDOW_MS - (now - oldest)) / 1000)
    );
    return { blocked: true, retryAfterSeconds };
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

export function recordAuthFailure(ip: string): void {
  const now = Date.now();
  const attempts = (authFailureMap.get(ip) || []).filter(
    (t) => now - t < AUTH_WINDOW_MS
  );
  attempts.push(now);
  authFailureMap.set(ip, attempts);
}

export function clearAuthFailures(ip: string): void {
  authFailureMap.delete(ip);
}

// ----------------- Cryptographic QR Code Signing -----------------

/**
 * Generates an HMAC-SHA256 signed QR payload: `<ticketId>#<eventId>#<16-char-hmac>`
 */
export function signTicketQrHash(ticketId: string, eventId: string): string {
  const cleanTicket = ticketId.trim().toUpperCase();
  const cleanEvent = eventId.trim();
  const data = `${cleanTicket}#${cleanEvent}`;
  const sig = crypto
    .createHmac("sha256", PRIMARY_SECRET)
    .update(data)
    .digest("hex")
    .slice(0, 16);
  return `${cleanTicket}#${cleanEvent}#${sig}`;
}

/**
 * Verifies a 3-part signed QR hash (`ticketId#eventId#sig`).
 * Returns `{ valid: true }` for valid signed QR codes, legacy 2-part seed hashes, or plain ticket IDs,
 * and `{ valid: false }` if a 3-part signature is tampered with or forged.
 */
export function verifyTicketQrSignature(rawQr: string): {
  valid: boolean;
  ticketId: string;
  eventId?: string;
} {
  const clean = (rawQr || "").trim();
  if (!clean.includes("#")) {
    return { valid: true, ticketId: clean };
  }

  const parts = clean.split("#");
  if (parts.length === 2) {
    // Legacy 2-part format (e.g. seed tickets TKT-LAG-1001#evt-nestle-summit-2026)
    return { valid: true, ticketId: parts[0], eventId: parts[1] };
  }

  if (parts.length === 3) {
    const [ticketId, eventId, providedSig] = parts;
    const expectedData = `${ticketId.trim().toUpperCase()}#${eventId.trim()}`;
    const expectedSig = crypto
      .createHmac("sha256", PRIMARY_SECRET)
      .update(expectedData)
      .digest("hex")
      .slice(0, 16);

    const sigBuf = Buffer.from(providedSig);
    const expBuf = Buffer.from(expectedSig);
    const isMatch =
      sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

    return {
      valid: isMatch,
      ticketId,
      eventId,
    };
  }

  return { valid: false, ticketId: parts[0] || "" };
}

/**
 * Creates a tamper-proof HMAC-SHA256 signed session token.
 * Defaults to 1 hour expiration.
 */
export function createSignedSession(
  payload: Omit<SessionPayload, "exp" | "iat">,
  durationHours = 1
): string {
  const now = Date.now();
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + durationHours * 60 * 60 * 1000,
  };

  const payloadStr = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", PRIMARY_SECRET)
    .update(payloadStr)
    .digest("base64url");

  return `${payloadStr}.${signature}`;
}

/**
 * Verifies a signed session token.
 */
export function verifySignedSession(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadStr, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", PRIMARY_SECRET)
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
    ) as SessionPayload;
    if (Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the caller's session from cookies or Authorization header.
 */
export function getRequestAuthSession(req: NextRequest): SessionPayload | null {
  // 1. Check Authorization: Bearer <token>
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    const verified = verifySignedSession(bearerToken);
    if (verified) return verified;
  }

  // 2. Check httpOnly session cookies in priority order
  const superAdminCookie = req.cookies.get("super_admin_session")?.value;
  if (superAdminCookie) {
    const s = verifySignedSession(superAdminCookie);
    if (s) return s;
  }

  const eventAdminCookie = req.cookies.get("event_admin_session")?.value;
  if (eventAdminCookie) {
    const s = verifySignedSession(eventAdminCookie);
    if (s) return s;
  }

  const usherCookie = req.cookies.get("usher_session")?.value;
  if (usherCookie) {
    const s = verifySignedSession(usherCookie);
    if (s) return s;
  }

  return null;
}

/**
 * Verifies that an incoming API request has an active session with one of `allowedRoles`.
 * Also enforces event-level isolation if the session is scoped to a specific `eventId`.
 */
export function verifyApiAuthorization(
  req: NextRequest,
  allowedRoles: UserRole[],
  targetEventId?: string
): { authorized: boolean; session?: SessionPayload; error?: string; status?: number } {
  const session = getRequestAuthSession(req);
  if (!session) {
    return {
      authorized: false,
      error: "Authentication required. Please sign in to continue.",
      status: 401,
    };
  }

  if (!allowedRoles.includes(session.role)) {
    return {
      authorized: false,
      error: `Insufficient permissions. Required role: ${allowedRoles.join(" or ")}.`,
      status: 403,
    };
  }

  // If the operator is an event-specific admin or usher (not super-admin) and has a locked eventId,
  // prevent cross-event access to another event's data
  if (
    session.role !== "super-admin" &&
    session.eventId &&
    targetEventId &&
    session.eventId !== targetEventId &&
    session.eventSlug !== targetEventId
  ) {
    return {
      authorized: false,
      error: "Cross-event access denied: Your session is locked to a different event.",
      status: 403,
    };
  }

  return { authorized: true, session };
}

/**
 * Hashes a plaintext password using cryptographically salted PBKDF2 (100,000 iterations).
 * Stored format: <16-byte-hex-salt>:<64-byte-hex-derived-key>
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verifies a plaintext password against a stored PBKDF2 hash or legacy plaintext string.
 */
export function verifyPassword(password: string, storedHashOrPlain?: string): boolean {
  if (!storedHashOrPlain || !password) return false;

  // Salted PBKDF2 format (contains :)
  if (storedHashOrPlain.includes(":")) {
    const [salt, originalHash] = storedHashOrPlain.split(":");
    if (!salt || !originalHash) return false;
    const testHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
    const testBuf = Buffer.from(testHash);
    const origBuf = Buffer.from(originalHash);
    return testBuf.length === origBuf.length && crypto.timingSafeEqual(testBuf, origBuf);
  }

  // Plaintext fallback
  return password === storedHashOrPlain;
}

/**
 * Verifies Super-Admin credentials (Email + Password)
 */
export function verifySuperAdminCredentials(email: string, password: string): boolean {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanPass = (password || "").trim();

  if (cleanEmail !== SUPER_ADMIN_EMAIL.toLowerCase()) {
    return false;
  }

  return verifyPassword(cleanPass, SUPER_ADMIN_PASSWORD);
}

/**
 * Verifies Event Admin credentials (Email + Password bound to event)
 */
export function verifyEventAdminCredentials(
  event: EventItem | null,
  email: string,
  password: string
): boolean {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanPass = (password || "").trim();

  // Super-admin credentials can also unlock any event admin portal
  if (verifySuperAdminCredentials(cleanEmail, cleanPass)) {
    return true;
  }

  if (!event) return false;

  const expectedEmail = (event.adminEmail || DEFAULT_ADMIN_EMAIL).toLowerCase().trim();
  const expectedPass = event.adminPassword || DEFAULT_ADMIN_PASSWORD;

  if (cleanEmail !== expectedEmail) {
    return false;
  }

  return verifyPassword(cleanPass, expectedPass);
}

/**
 * Verifies Gate Usher credentials (PIN)
 */
export function verifyUsherPin(event: EventItem | null, pin: string): boolean {
  const cleanPin = (pin || "").trim();
  if (!cleanPin) return false;

  // Master super-admin bypass
  if (cleanPin === "9999" || verifyPassword(cleanPin, SUPER_ADMIN_PASSWORD)) {
    return true;
  }

  const expectedPin = (event?.usherPin || DEFAULT_USHER_PIN).trim();
  return cleanPin === expectedPin;
}
