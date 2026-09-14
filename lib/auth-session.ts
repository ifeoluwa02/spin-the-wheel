import crypto from "crypto";

const SESSION_SECRET =
  process.env.AUTH_SECRET ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "spin-the-wheel-default-secret-salt-2026";

export interface SessionPayload {
  role: "super-admin" | "admin" | "supervisor";
  email: string;
  name?: string;
  campaignId?: string;
  supervisorId?: string;
  scopeType?: "state" | "stores";
  state?: string;
  storeIds?: string[];
  exp: number; // Unix timestamp in ms
}

/**
 * Creates a tamper-proof HMAC-SHA256 signed session token.
 */
export function createSignedSession(payload: Omit<SessionPayload, "exp">, durationHours = 24): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + durationHours * 60 * 60 * 1000,
  };

  const payloadStr = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadStr)
    .digest("base64url");

  return `${payloadStr}.${signature}`;
}

/**
 * Verifies a tamper-proof session token and returns the payload if valid.
 */
export function verifySignedSession(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadStr, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadStr)
    .digest("base64url");

  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf8")) as SessionPayload;
    if (Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}
