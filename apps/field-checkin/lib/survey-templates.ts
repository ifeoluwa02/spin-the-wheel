import type { SurveyQuestion, SurveyRecord } from "./types";

/**
 * Extracts the uppercase brand prefix from the first word of a campaign's brandName, name, or id.
 * Examples:
 * - { brandName: "Molfix Activation" } -> "MOLFIX"
 * - { brandName: "PZ Cussons Baby Hospital Sampling Activation" } -> "PZ"
 * - { brandName: "Golden Morn", name: "Nestlé Golden Morn Activation" } -> "GOLDEN"
 */
export function extractBrandPrefix(
  campaign?: { brandName?: string; name?: string; id?: string } | null
): string {
  const candidates = [campaign?.brandName, campaign?.name, campaign?.id];
  for (const raw of candidates) {
    if (!raw || typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const tokens = trimmed
      .split(/[\s_\-]+/)
      .map((t) => t.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
      .filter((t) => t.length >= 2);
    if (tokens.length > 0) {
      return tokens[0].slice(0, 12);
    }
  }
  return "RESP";
}

/**
 * Generates a cryptographically random 6-digit numeric string ("100000" - "999999").
 */
export function generateRespondentDigits(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      const num = 100000 + (arr[0] % 900000);
      return String(num);
    }
  } catch {}
  const fallback = Math.floor(100000 + Math.random() * 900000);
  return String(fallback);
}

/**
 * Deterministically derives a 6-digit numeric code ("100000" - "999999") from a request ID string.
 * Used when an offline queue item only has a legacy/request ID so retries always map to the same digits.
 */
export function deriveDigitsFromRequestId(requestId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < requestId.length; i++) {
    hash ^= requestId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const num = 100000 + ((hash >>> 0) % 900000);
  return String(num);
}

/**
 * Validates and extracts the 6-8 digit numeric portion from a client-supplied Respondent ID or digits string.
 * Strictly rejects any path traversal, script tags, or malformed strings by returning undefined.
 */
export function extractValidatedDigitsFromId(candidate?: unknown): string | undefined {
  if (typeof candidate !== "string") return undefined;
  const trimmed = candidate.trim();
  const match = trimmed.match(/^(?:[A-Z0-9]{2,12}-)?(\d{6,8})$/i);
  if (!match) return undefined;
  return match[1];
}

/**
 * Validates a client-supplied idempotency token (`clientRequestId`).
 * Only permits safe alphanumeric, underscore, and hyphen characters (8..64 chars).
 */
export function sanitizeClientRequestId(raw?: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Generates a client request idempotency token.
 */
export function generateClientRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `req_${crypto.randomUUID().replace(/-/g, "")}`;
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `req_${hex}`;
    }
  } catch {}
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Generates a brand-prefixed Respondent ID like "MOLFIX-849201" or "PZ-394012".
 * The prefix is always computed from the authoritative campaign metadata, and the numeric suffix
 * is strictly validated to be 6-8 digits (or freshly generated via CSPRNG).
 */
export function generateRespondentId(
  campaign?: { brandName?: string; name?: string; id?: string } | null,
  candidateIdOrDigits?: unknown,
  fallbackRequestId?: unknown
): string {
  const prefix = extractBrandPrefix(campaign);
  const validDigits = extractValidatedDigitsFromId(candidateIdOrDigits);
  if (validDigits) {
    return `${prefix}-${validDigits}`;
  }
  const cleanReqId = sanitizeClientRequestId(fallbackRequestId);
  if (cleanReqId) {
    return `${prefix}-${deriveDigitsFromRequestId(cleanReqId)}`;
  }
  return `${prefix}-${generateRespondentDigits()}`;
}

/**
 * Checks whether any `uniqueValue: true` survey question has already been answered with the same
 * normalized value by a DIFFERENT survey submission, while allowing idempotent retries of the same
 * survey (matching `currentRespondentId` or `currentClientRequestId`) to pass without error.
 */
export function findDuplicateUniqueSurveyAnswer(params: {
  questions?: SurveyQuestion[] | null;
  incomingAnswers?: Record<string, string> | null;
  incomingPhone?: string;
  existingSurveys: Array<Pick<SurveyRecord, "id" | "clientRequestId" | "respondentPhone" | "surveyAnswers">>;
  currentRespondentId?: string;
  currentClientRequestId?: string;
}): { questionId: string; questionLabel: string; duplicateValue: string } | null {
  const {
    questions,
    incomingAnswers,
    incomingPhone,
    existingSurveys,
    currentRespondentId,
    currentClientRequestId,
  } = params;
  if (!Array.isArray(questions) || questions.length === 0) return null;

  const uniqueQuestions = questions.filter((q) => q && q.uniqueValue);
  if (uniqueQuestions.length === 0) return null;

  const cleanCurrentId = (currentRespondentId || "").trim();
  const cleanCurrentReqId = sanitizeClientRequestId(currentClientRequestId);

  for (const q of uniqueQuestions) {
    const rawVal = (
      incomingAnswers?.[q.id] ||
      (q.type === "tel" ? incomingPhone : "") ||
      ""
    ).trim();
    if (!rawVal) continue;
    const normVal =
      q.numericOnly || q.type === "number" || q.type === "tel"
        ? rawVal.replace(/[\s\-+]/g, "").toLowerCase()
        : rawVal.toLowerCase();
    if (!normVal) continue;

    for (const prev of existingSurveys) {
      // Idempotency exemption: if this record is the exact same submission retrying, it is not a conflict
      if (cleanCurrentId && prev.id === cleanCurrentId) continue;
      if (cleanCurrentReqId && prev.clientRequestId && prev.clientRequestId === cleanCurrentReqId) {
        continue;
      }

      const prevRaw = (
        prev.surveyAnswers?.[q.id] ||
        (q.type === "tel" ? prev.respondentPhone : "") ||
        ""
      ).trim();
      if (!prevRaw) continue;
      const prevNorm =
        q.numericOnly || q.type === "number" || q.type === "tel"
          ? prevRaw.replace(/[\s\-+]/g, "").toLowerCase()
          : prevRaw.toLowerCase();

      if (prevNorm && prevNorm === normVal) {
        return {
          questionId: q.id,
          questionLabel: q.label,
          duplicateValue: rawVal,
        };
      }
    }
  }

  return null;
}

export const DEFAULT_HOSPITAL_QUESTIONS: SurveyQuestion[] = [
  {
    id: "mother_name",
    label: "MOTHER'S NAME",
    type: "text",
    required: true,
    placeholder: "e.g. Mrs. Ngozi Eze",
  },
  {
    id: "phone_no",
    label: "PHONE NO.",
    type: "tel",
    required: false,
    placeholder: "e.g. 08031234567",
  },
  {
    id: "clinic",
    label: "CLINIC",
    type: "select",
    required: true,
    options: ["ANC", "IMC"],
  },
  {
    id: "hospital_name",
    label: "HOSPITAL NAME",
    type: "text",
    required: true,
    placeholder: "Enter hospital name",
    autoFillStoreName: true,
  },
  {
    id: "marketing_consent",
    label:
      "We would love to stay in touch to gather your feedback and share updates about Cussons Baby Skincare Range, Molfix Baby Diaper and related promotions. Please indicate your preference below:",
    type: "radio_consent",
    required: true,
    options: [
      "Yes, I consent to being contacted by Cussons Baby Range for feedback and promotional updates",
      "No, I do not wish to be contacted.",
    ],
  },
];
