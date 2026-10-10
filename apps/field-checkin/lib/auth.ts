import crypto from "crypto";

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

  // Plaintext comparison fallback
  return password === storedHashOrPlain;
}
