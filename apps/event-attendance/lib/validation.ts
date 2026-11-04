import { AttendeeRegistration } from "./types";

/**
 * Comprehensive Input Validation & PHP / Script / NoSQL / Command Injection Guard
 */

// Regex patterns matching PHP tags, PHP stream wrappers, PHP execution functions, XSS/HTML tags, and NoSQL operators
const PHP_AND_CODE_INJECTION_PATTERNS: RegExp[] = [
  /<\?php/i,
  /<\?=/i,
  /<\?/i,
  /\?>/i,
  /\b(php|phar|zlib|data|glob|expect|input):\/\//i,
  /\b(eval|exec|system|passthru|shell_exec|popen|proc_open|pcntl_exec|assert|create_function|base64_decode|file_get_contents|file_put_contents|fopen|readfile|unlink|include|include_once|require|require_once)\s*\(/i,
  /\$_(GET|POST|REQUEST|SERVER|FILES|COOKIE|SESSION|ENV)\b/i,
  /\$GLOBALS\b/i,
  /<\s*\/?\s*(script|iframe|object|embed|svg|link|style|meta|applet|form|input|body|html)\b/i,
  /\b(javascript|vbscript)\s*:/i,
  /\bon(load|error|click|mouseover|focus|blur|submit|change|keyup|keydown)\s*=/i,
  /\$\{[^}]*\}/, // Template literal / EL injection
  /\{\{[^}]*\}\}/, // Server-side template injection (SSTI)
  /\$(where|ne|gt|gte|lt|lte|in|nin|regex|or|and|nor|not|expr)\b/i, // MongoDB NoSQL operator injection
  /\0/, // Null-byte injection
];

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,15}$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;
const SAFE_ID_OR_SLUG_REGEX = /^[a-zA-Z0-9_-]{2,90}$/;
const SAFE_NAME_REGEX = /^[\p{L}\p{M}\s.'\-]{2,100}$/u;
const USHER_PIN_REGEX = /^[0-9]{4,8}$/;

export const ALLOWED_TICKET_TYPES: ReadonlyArray<AttendeeRegistration["ticketType"]> = [
  "General Admission",
  "VIP",
  "Speaker",
  "Exhibitor",
];

/**
 * Detects PHP code injection, XSS/HTML script payloads, SSTI, and NoSQL operator injection.
 */
export function containsMaliciousPayload(input: unknown): boolean {
  if (input === null || input === undefined) return false;

  // Reject non-primitive objects/arrays passed where strings are expected (NoSQL operator injection e.g. {"$ne": null})
  if (typeof input === "object") {
    return true;
  }

  const str = String(input);
  for (const pattern of PHP_AND_CODE_INJECTION_PATTERNS) {
    if (pattern.test(str)) {
      return true;
    }
  }
  return false;
}

/**
 * Strips null bytes, control characters, and raw angle brackets (< >), and enforces max length.
 */
export function sanitizeText(input: unknown, maxLength = 200): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength);
}

/**
 * Escapes HTML special characters for safe interpolation inside HTML email templates.
 */
export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Escapes regular expression metacharacters to prevent ReDoS / Regex Injection in MongoDB queries.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Prevents CSV Formula Injection (DDE / Excel / Google Sheets execution via =, +, -, @ prefixes).
 */
export function sanitizeCsvCell(input: unknown): string {
  const str = String(input ?? "").replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export interface ValidationResult<T> {
  valid: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
}

export interface ValidatedRegistrationData {
  eventId: string;
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  jobTitle: string;
  ticketType: AttendeeRegistration["ticketType"];
  customData: Record<string, string>;
}

/**
 * Validates and sanitizes all fields on the Attendee Registration form & API.
 */
export function validateRegistrationPayload(
  body: Record<string, unknown>
): ValidationResult<ValidatedRegistrationData> {
  const fieldErrors: Record<string, string> = {};

  // Check all top-level string fields for PHP/Script/NoSQL injection first
  const fieldsToScan = [
    ["eventId", body.eventId],
    ["fullName", body.fullName],
    ["email", body.email],
    ["phone", body.phone],
    ["organization", body.organization],
    ["jobTitle", body.jobTitle],
    ["ticketType", body.ticketType],
  ] as const;

  for (const [fieldName, rawValue] of fieldsToScan) {
    if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
      if (containsMaliciousPayload(rawValue)) {
        fieldErrors[fieldName] = `Invalid characters or code injection detected in ${fieldName}.`;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      valid: false,
      error: "Security validation failed: PHP, script, or query injection payload detected.",
      fieldErrors,
    };
  }

  // 1. eventId
  const eventId = sanitizeText(body.eventId, 90);
  if (!eventId || !SAFE_ID_OR_SLUG_REGEX.test(eventId)) {
    fieldErrors.eventId = "A valid Event ID is required.";
  }

  // 2. fullName
  const fullName = sanitizeText(body.fullName, 100);
  if (!fullName || fullName.length < 2) {
    fieldErrors.fullName = "Full name must be at least 2 characters.";
  } else if (!SAFE_NAME_REGEX.test(fullName)) {
    fieldErrors.fullName =
      "Full name may only contain letters, spaces, hyphens, apostrophes, and periods.";
  }

  // 3. email
  const email = sanitizeText(body.email, 160).toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) {
    fieldErrors.email = "Please enter a valid email address (e.g. name@company.com).";
  }

  // 4. phone (optional, but strictly validated if provided)
  const rawPhone = sanitizeText(body.phone, 20);
  if (rawPhone && !PHONE_REGEX.test(rawPhone)) {
    fieldErrors.phone =
      "Phone number must be 7–20 digits and may only include +, -, spaces, or parentheses.";
  }

  // 5. organization (optional, max 120 chars)
  const organization = sanitizeText(body.organization, 120);
  if (/[;{}[\]\\`$]/.test(organization)) {
    fieldErrors.organization = "Organization contains disallowed special characters.";
  }

  // 6. jobTitle (optional, max 100 chars)
  const jobTitle = sanitizeText(body.jobTitle, 100);
  if (/[;{}[\]\\`$]/.test(jobTitle)) {
    fieldErrors.jobTitle = "Job title contains disallowed special characters.";
  }

  // 7. ticketType
  const rawTier = sanitizeText(body.ticketType || "General Admission", 40);
  const ticketType = (
    ALLOWED_TICKET_TYPES.includes(rawTier as AttendeeRegistration["ticketType"])
      ? rawTier
      : null
  ) as AttendeeRegistration["ticketType"] | null;

  if (!ticketType) {
    fieldErrors.ticketType = "Invalid pass tier selected.";
  }

  // 8. customData
  const sanitizedCustomData: Record<string, string> = {};
  if (body.customData && typeof body.customData === "object" && !Array.isArray(body.customData)) {
    for (const [k, v] of Object.entries(body.customData as Record<string, unknown>)) {
      if (containsMaliciousPayload(k) || containsMaliciousPayload(v)) {
        fieldErrors.customData = "Malicious payload detected in custom registration fields.";
        break;
      }
      const cleanKey = sanitizeText(k, 50);
      const cleanVal = sanitizeText(v, 200);
      if (cleanKey) {
        sanitizedCustomData[cleanKey] = cleanVal;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    const firstError = Object.values(fieldErrors)[0];
    return {
      valid: false,
      error: firstError,
      fieldErrors,
    };
  }

  return {
    valid: true,
    data: {
      eventId,
      fullName,
      email,
      phone: rawPhone,
      organization,
      jobTitle,
      ticketType: ticketType!,
      customData: sanitizedCustomData,
    },
  };
}

export interface ValidatedCreateEventData {
  title: string;
  slug: string;
  category: string;
  organizer: string;
  description: string;
  venueName: string;
  venueAddress: string;
  city: string;
  state: string;
  startDate: string;
  endDate: string;
  capacity: number;
  bannerGradient: string;
  adminEmail: string;
  adminPassword: string;
  usherPin: string;
}

/**
 * Validates and sanitizes all fields on the Create New Event modal & API.
 */
export function validateCreateEventPayload(
  body: Record<string, unknown>
): ValidationResult<ValidatedCreateEventData> {
  const fieldErrors: Record<string, string> = {};

  const textFields = [
    ["title", body.title],
    ["slug", body.slug],
    ["category", body.category],
    ["organizer", body.organizer],
    ["description", body.description],
    ["venueName", body.venueName],
    ["venueAddress", body.venueAddress],
    ["city", body.city],
    ["state", body.state],
    ["adminEmail", body.adminEmail],
    ["usherPin", body.usherPin],
  ] as const;

  for (const [name, val] of textFields) {
    if (val !== undefined && val !== null && val !== "" && containsMaliciousPayload(val)) {
      fieldErrors[name] = `Disallowed code or injection pattern detected in ${name}.`;
    }
  }

  if (body.adminPassword !== undefined && containsMaliciousPayload(body.adminPassword)) {
    fieldErrors.adminPassword = "Invalid characters in admin password.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      valid: false,
      error: "Security validation failed: PHP or script injection payload blocked.",
      fieldErrors,
    };
  }

  const title = sanitizeText(body.title, 140);
  if (!title || title.length < 3) {
    fieldErrors.title = "Event title must be between 3 and 140 characters.";
  }

  const rawSlug = sanitizeText(body.slug, 80)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const computedSlug =
    rawSlug ||
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  if (!computedSlug || computedSlug.length < 2) {
    fieldErrors.slug = "Event URL slug is invalid.";
  }

  const venueName = sanitizeText(body.venueName, 140);
  if (!venueName || venueName.length < 2) {
    fieldErrors.venueName = "Venue name is required (min 2 characters).";
  }

  const venueAddress = sanitizeText(body.venueAddress, 200);
  const city = sanitizeText(body.city || "Lagos", 80) || "Lagos";
  const state = sanitizeText(body.state || city, 80) || "Lagos";
  const category = sanitizeText(body.category || "Brand Activation", 80) || "Brand Activation";
  const organizer = sanitizeText(body.organizer || "Event Organizer", 120) || "Event Organizer";
  const description = sanitizeText(body.description || "", 600);

  const rawStartDate = typeof body.startDate === "string" ? body.startDate.trim() : "";
  const parsedStart = rawStartDate ? new Date(rawStartDate) : null;
  if (!parsedStart || isNaN(parsedStart.getTime())) {
    fieldErrors.startDate = "A valid event start date and time is required.";
  }

  const rawEndDate = typeof body.endDate === "string" ? body.endDate.trim() : "";
  const parsedEnd = rawEndDate ? new Date(rawEndDate) : parsedStart;

  const numCapacity = Number(body.capacity ?? 500);
  if (!Number.isFinite(numCapacity) || numCapacity < 1 || numCapacity > 100000) {
    fieldErrors.capacity = "Capacity must be a number between 1 and 100,000.";
  }

  const adminEmail = sanitizeText(
    body.adminEmail || `admin@${computedSlug || "event"}.com`,
    160
  ).toLowerCase();
  if (!EMAIL_REGEX.test(adminEmail)) {
    fieldErrors.adminEmail = "Event Admin Email must be a valid email address.";
  }

  const adminPassword =
    typeof body.adminPassword === "string" && body.adminPassword.trim().length > 0
      ? body.adminPassword.trim()
      : "admin123";
  if (adminPassword.length < 6 || adminPassword.length > 128) {
    fieldErrors.adminPassword = "Admin password must be between 6 and 128 characters.";
  }

  const usherPin = sanitizeText(body.usherPin || "0000", 8);
  if (!USHER_PIN_REGEX.test(usherPin)) {
    fieldErrors.usherPin = "Gate Usher PIN must be 4 to 8 digits (numbers only).";
  }

  const bannerGradient =
    sanitizeText(body.bannerGradient, 100) || "from-indigo-600 via-purple-600 to-pink-600";

  if (Object.keys(fieldErrors).length > 0) {
    return {
      valid: false,
      error: Object.values(fieldErrors)[0],
      fieldErrors,
    };
  }

  return {
    valid: true,
    data: {
      title,
      slug: computedSlug,
      category,
      organizer,
      description,
      venueName,
      venueAddress,
      city,
      state,
      startDate: parsedStart!.toISOString(),
      endDate: parsedEnd && !isNaN(parsedEnd.getTime()) ? parsedEnd.toISOString() : parsedStart!.toISOString(),
      capacity: Math.round(numCapacity),
      bannerGradient,
      adminEmail,
      adminPassword,
      usherPin,
    },
  };
}

/**
 * Validates QR / Ticket ID strings scanned or manually typed into the Gate Scanner.
 */
export function validateQrOrTicketInput(
  qrData: unknown,
  eventId?: unknown
): ValidationResult<{ qrData: string; eventId?: string }> {
  if (!qrData || typeof qrData !== "string") {
    return { valid: false, error: "QR code or Ticket ID is required." };
  }

  if (containsMaliciousPayload(qrData) || (eventId && containsMaliciousPayload(eventId))) {
    return {
      valid: false,
      error: "Rejected: Malicious PHP or script payload detected in scanner input.",
    };
  }

  const cleanQr = sanitizeText(qrData, 250);
  if (!cleanQr) {
    return { valid: false, error: "Ticket code is empty or invalid." };
  }

  const cleanEventId = eventId ? sanitizeText(eventId, 90) : undefined;
  if (cleanEventId && !SAFE_ID_OR_SLUG_REGEX.test(cleanEventId)) {
    return { valid: false, error: "Invalid target event ID." };
  }

  return {
    valid: true,
    data: {
      qrData: cleanQr,
      eventId: cleanEventId,
    },
  };
}

