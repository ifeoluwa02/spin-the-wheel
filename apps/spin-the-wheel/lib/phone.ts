/**
 * Nigerian Mobile Number Validation and Normalization
 * 
 * Supports:
 * - 11 digits with leading 0 (e.g. 08031234567, 09012345678, 08123456789, 07034567890, 09123456789)
 * - 13/14 digits with +234 or 234 (e.g. +2348031234567, 2348031234567)
 * - 10 digits without leading 0 (e.g. 8031234567)
 *
 * Valid prefixes: 070, 080, 081, 090, 091
 */

export function normalizeNigerianPhone(phone: string): string | null {
  if (!phone) return null;

  // Strip all non-digits
  let digits = phone.trim().replace(/\D/g, "");

  // Convert international +234 / 234 prefix to local 0
  if (digits.startsWith("234") && digits.length === 13) {
    digits = "0" + digits.slice(3);
  } else if (digits.length === 10 && /^[789][01]\d{8}$/.test(digits)) {
    digits = "0" + digits;
  }

  // Standard Nigerian mobile number: 11 digits starting with 070, 080, 081, 090, 091
  const nigerianMobileRegex = /^0(70|80|81|90|91)\d{8}$/;
  if (nigerianMobileRegex.test(digits)) {
    return digits;
  }

  return null;
}

export function isValidNigerianPhone(phone: string): boolean {
  return normalizeNigerianPhone(phone) !== null;
}
