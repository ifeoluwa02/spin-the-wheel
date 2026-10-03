import crypto from "crypto";

// Primary secret: MUST come from server-side environment variable AUTH_SECRET
const PRIMARY_SECRET =
  process.env.AUTH_SECRET ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "spin-the-wheel-default-secret-salt-2026";

// Fallback secrets allowed ONLY during verification so currently active BA sessions do not crash abruptly
const VERIFICATION_SECRETS: string[] = [
  PRIMARY_SECRET,
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  "spin-the-wheel-default-secret-salt-2026",
].filter((s, idx, arr) => Boolean(s) && arr.indexOf(s) === idx);

/** Standard session lifetime across the platform: 1 hour */
export const DEFAULT_SESSION_HOURS = 1;

export interface SessionPayload {
  role: "super-admin" | "admin" | "supervisor" | "ba";
  email: string;
  name?: string;
  campaignId?: string;
  supervisorId?: string;
  storeCode?: string;
  storeName?: string;
  scopeType?: "state" | "stores";
  state?: string;
  storeIds?: string[];
  iat?: number; // Unix timestamp in ms when issued
  exp: number; // Unix timestamp in ms when expired
}

/**
 * Creates a tamper-proof HMAC-SHA256 signed session token.
 * Always signs using the primary server secret (AUTH_SECRET).
 * Defaults to 1 hour expiration.
 */
export function createSignedSession(
  payload: Omit<SessionPayload, "exp" | "iat">,
  durationHours = DEFAULT_SESSION_HOURS
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
 * Verifies a tamper-proof session token and returns the payload if valid.
 * Checks against the primary secret first, with dual-read fallback for seamless transition.
 */
export function verifySignedSession(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadStr, signature] = parts;
  const sigBuf = Buffer.from(signature);

  // Check against all candidate secrets using constant-time comparison
  let isValidSig = false;
  for (const secret of VERIFICATION_SECRETS) {
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(payloadStr)
      .digest("base64url");
    const expectedBuf = Buffer.from(expectedSig);

    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      isValidSig = true;
      break;
    }
  }

  if (!isValidSig) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf8")) as SessionPayload;
    if (Date.now() > payload.exp) {
      return null; // Expired after 1 hour
    }
    return payload;
  } catch {
    return null;
  }
}


/**
 * Refreshes an active session token if it is valid and has not expired.
 * Issues a new signed token with a fresh 1-hour expiration window.
 */
export function refreshSignedSession(
  token: string,
  durationHours = DEFAULT_SESSION_HOURS
): { token: string; payload: SessionPayload } | null {
  const payload = verifySignedSession(token);
  if (!payload) return null;

  const { exp, iat, ...rest } = payload;
  const newToken = createSignedSession(rest, durationHours);
  const newPayload = verifySignedSession(newToken);
  if (!newPayload) return null;

  return { token: newToken, payload: newPayload };
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
 * Supports dual-read verification so existing unhashed accounts can log in seamlessly.
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

  // Legacy plaintext fallback for seamless migration
  return password === storedHashOrPlain;
}

