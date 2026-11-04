import fs from "fs";
import path from "path";
import { EventItem, AttendeeRegistration } from "./types";
import { generateTicketEmailHtml } from "./email-template";
import { getMongoDb } from "./mongodb";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";

/**
 * Resend Free Tier Limits & Constants
 * - 100 emails / day (resets 00:00:00 UTC)
 * - 2 requests / second rate limit
 */
export const DEFAULT_RESEND_DAILY_LIMIT = 100;
export const RESEND_RATE_LIMIT_DELAY_MS = 600; // 600ms throttle between sends to stay under 2 req/sec

export interface EmailQuotaStats {
  date: string; // YYYY-MM-DD in UTC
  sentToday: number;
  queuedToday: number;
  limit: number;
  remainingToday: number;
  isLimitReached: boolean;
  resetsAt: string; // ISO string of next UTC midnight
  resetsInHours: number;
  resetsInMinutes: number;
}

export interface QueuedEmail {
  id: string;
  attendeeId: string;
  attendeeName: string;
  eventId: string;
  eventTitle: string;
  to: string;
  subject: string;
  html: string;
  status: "queued" | "sent" | "failed";
  queueReason: "DAILY_LIMIT_REACHED" | "RATE_LIMIT_429" | "NETWORK_ERROR" | "RETRY_SCHEDULED";
  attempts: number;
  createdAt: string;
  scheduledFor: string; // ISO timestamp
  sentAt?: string;
  resendMessageId?: string;
  lastError?: string;
}

interface EmailServiceStore {
  date: string; // Current tracked UTC day
  sentToday: number;
  queued: QueuedEmail[];
}

// In-memory runtime cache for server-side fast access
let memoryStore: EmailServiceStore = {
  date: getUtcDateString(),
  sentToday: 0,
  queued: [],
};

// Local file storage path (preserves state across dev server reloads)
const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "email-service-data.json");

function getUtcDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0]; // "YYYY-MM-DD"
}

function getNextUtcMidnight(): Date {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return next;
}

function isFirestoreActive(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "mock-app"
  );
}

/**
 * Load store from disk or memory, rolling over the day if midnight UTC has passed
 */
function loadStore(): EmailServiceStore {
  const today = getUtcDateString();

  // Try reading from cache file if memoryStore is empty
  if (memoryStore.queued.length === 0) {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, "utf-8");
        const parsed: EmailServiceStore = JSON.parse(raw);
        if (parsed) {
          memoryStore = parsed;
        }
      }
    } catch (e) {
      console.warn("Could not read email cache file:", e);
    }
  }

  // Check if day rolled over
  if (memoryStore.date !== today) {
    console.log(`[EmailService] Day rolled over from ${memoryStore.date} to ${today}. Resetting daily counter.`);
    memoryStore.date = today;
    memoryStore.sentToday = 0;
    saveStore();
  }

  return memoryStore;
}

/**
 * Persist store to disk and sync to MongoDB Atlas (serverless-durable)
 */
function saveStore(): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryStore, null, 2), "utf-8");
  } catch (e) {
    console.warn("Could not save email cache file:", e);
  }

  // Async background sync to MongoDB Atlas so serverless instances share quota & queue
  getMongoDb()
    .then(async (mongo) => {
      if (!mongo) return;
      await mongo.collection("email_quota").updateOne(
        { date: memoryStore.date },
        { $set: { date: memoryStore.date, sentToday: memoryStore.sentToday, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
      for (const item of memoryStore.queued) {
        await mongo.collection("email_queue").updateOne(
          { id: item.id },
          { $set: { ...item } },
          { upsert: true }
        );
      }
    })
    .catch(() => {});
}

async function hydrateStoreFromMongo(): Promise<void> {
  try {
    const mongo = await getMongoDb();
    if (!mongo) return;
    const today = getUtcDateString();
    const quotaDoc = await mongo.collection("email_quota").findOne({ date: today });
    if (quotaDoc && typeof quotaDoc.sentToday === "number") {
      memoryStore.date = today;
      memoryStore.sentToday = Math.max(memoryStore.sentToday, quotaDoc.sentToday);
    }
    const queueDocs = await mongo
      .collection("email_queue")
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    if (queueDocs && queueDocs.length > 0) {
      const byId = new Map<string, QueuedEmail>();
      for (const q of memoryStore.queued) byId.set(q.id, q);
      for (const doc of queueDocs) {
        const { _id, ...rest } = doc;
        byId.set(rest.id as string, rest as unknown as QueuedEmail);
      }
      memoryStore.queued = Array.from(byId.values());
    }
  } catch {
    // Ignore if offline
  }
}

/**
 * Get current daily quota stats
 */
export async function getEmailQuotaStats(): Promise<EmailQuotaStats> {
  await hydrateStoreFromMongo();
  const store = loadStore();
  const limit = parseInt(process.env.RESEND_DAILY_LIMIT || String(DEFAULT_RESEND_DAILY_LIMIT), 10);
  const nextMidnight = getNextUtcMidnight();
  const now = new Date();
  const diffMs = Math.max(0, nextMidnight.getTime() - now.getTime());
  const resetsInHours = Math.floor(diffMs / (1000 * 60 * 60));
  const resetsInMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const queuedToday = store.queued.filter(
    (q) => q.status === "queued"
  ).length;

  const remainingToday = Math.max(0, limit - store.sentToday);

  return {
    date: store.date,
    sentToday: store.sentToday,
    queuedToday,
    limit,
    remainingToday,
    isLimitReached: store.sentToday >= limit,
    resetsAt: nextMidnight.toISOString(),
    resetsInHours,
    resetsInMinutes,
  };
}

/**
 * Sleep helper for rate-limiting
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send an email directly via Resend API
 */
async function callResendApi(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string; status?: number }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "RESEND_API_KEY environment variable is not configured.",
    };
  }

  // Default to onboarding@resend.dev if custom domain is not set yet
  const fromEmail = process.env.EMAIL_FROM || "Events <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      return { ok: true, messageId: data.id };
    }

    const errorMsg = data.message || `Resend error: ${res.status} ${res.statusText}`;
    return { ok: false, error: errorMsg, status: res.status };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error contacting Resend";
    return { ok: false, error: errorMsg };
  }
}

/**
 * Main delivery entry point:
 * Checks daily limit first. If within limit, attempts to send immediately.
 * If limit reached (or if Resend returns a rate limit/quota error), cleanly queues the email for next day.
 */
export async function sendOrQueueTicketEmail(params: {
  event: EventItem;
  attendee: AttendeeRegistration;
  appBaseUrl: string;
}): Promise<{
  delivered: boolean;
  status: "sent" | "queued" | "mock_sent";
  queueReason?: string;
  messageId?: string;
  error?: string;
  stats: EmailQuotaStats;
}> {
  const { event, attendee, appBaseUrl } = params;
  const store = loadStore();
  const quota = await getEmailQuotaStats();

  const emailHtml = generateTicketEmailHtml({
    event,
    attendee,
    appBaseUrl,
  });

  const subject = `🎟️ Your Entry Ticket: ${event.title}`;
  const apiKey = process.env.RESEND_API_KEY;

  // Case 1: No Resend API key configured - Mock mode for instant development preview
  if (!apiKey) {
    return {
      delivered: false,
      status: "mock_sent",
      stats: quota,
    };
  }

  // Case 2: Daily limit has been reached!
  if (quota.isLimitReached) {
    const nextMidnight = getNextUtcMidnight();
    // Schedule for 5 minutes after midnight UTC so daily counters have cleared
    const scheduledDate = new Date(nextMidnight.getTime() + 5 * 60 * 1000);

    const queuedItem: QueuedEmail = {
      id: `eml_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      attendeeId: attendee.id,
      attendeeName: attendee.fullName,
      eventId: event.id,
      eventTitle: event.title,
      to: attendee.email,
      subject,
      html: emailHtml,
      status: "queued",
      queueReason: "DAILY_LIMIT_REACHED",
      attempts: 0,
      createdAt: new Date().toISOString(),
      scheduledFor: scheduledDate.toISOString(),
    };

    store.queued.push(queuedItem);
    saveStore();

    // Sync to Firestore if active
    if (isFirestoreActive()) {
      setDoc(doc(db, "email_queue", queuedItem.id), queuedItem).catch((e) =>
        console.warn("Firestore email queue write error:", e)
      );
    }

    const updatedQuota = await getEmailQuotaStats();
    return {
      delivered: false,
      status: "queued",
      queueReason: "DAILY_LIMIT_REACHED",
      stats: updatedQuota,
    };
  }

  // Case 3: Within quota, attempt direct delivery
  const resendResult = await callResendApi({
    to: attendee.email,
    subject,
    html: emailHtml,
  });

  if (resendResult.ok) {
    store.sentToday += 1;
    saveStore();

    const updatedQuota = await getEmailQuotaStats();
    return {
      delivered: true,
      status: "sent",
      messageId: resendResult.messageId,
      stats: updatedQuota,
    };
  }

  // Case 4: Delivery failed due to Resend rate-limit (429) or temporary network issue
  // Queue it instead of letting the attendee's ticket be lost!
  const isRateLimit = resendResult.status === 429;
  const nextAttempt = isRateLimit
    ? new Date(Date.now() + 60 * 1000) // retry in 1 minute if transient rate limit
    : getNextUtcMidnight(); // next day if quota exceeded

  const queuedItem: QueuedEmail = {
    id: `eml_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    attendeeId: attendee.id,
    attendeeName: attendee.fullName,
    eventId: event.id,
    eventTitle: event.title,
    to: attendee.email,
    subject,
    html: emailHtml,
    status: "queued",
    queueReason: isRateLimit ? "RATE_LIMIT_429" : "NETWORK_ERROR",
    attempts: 1,
    createdAt: new Date().toISOString(),
    scheduledFor: nextAttempt.toISOString(),
    lastError: resendResult.error,
  };

  store.queued.push(queuedItem);
  saveStore();

  const updatedQuota = await getEmailQuotaStats();
  return {
    delivered: false,
    status: "queued",
    queueReason: queuedItem.queueReason,
    error: resendResult.error,
    stats: updatedQuota,
  };
}

/**
 * Process pending emails in the queue:
 * Called automatically by background runner or manually by admin from dashboard.
 */
export async function processQueuedEmails(maxToProcess = 25): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  remainingInQueue: number;
  quota: EmailQuotaStats;
}> {
  const store = loadStore();
  let quota = await getEmailQuotaStats();

  if (quota.isLimitReached) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      remainingInQueue: store.queued.filter((q) => q.status === "queued").length,
      quota,
    };
  }

  const now = new Date();
  // Find queued emails eligible to send now
  const pending = store.queued.filter(
    (q) => q.status === "queued" && new Date(q.scheduledFor) <= now
  );

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const item of pending.slice(0, maxToProcess)) {
    // Check if we hit quota midway through batch
    if (store.sentToday >= quota.limit) {
      item.queueReason = "DAILY_LIMIT_REACHED";
      item.scheduledFor = getNextUtcMidnight().toISOString();
      break;
    }

    processed++;
    item.attempts++;

    // Throttle to respect Resend 2 req/sec rate limit
    await sleep(RESEND_RATE_LIMIT_DELAY_MS);

    const result = await callResendApi({
      to: item.to,
      subject: item.subject,
      html: item.html,
    });

    if (result.ok) {
      item.status = "sent";
      item.sentAt = new Date().toISOString();
      item.resendMessageId = result.messageId;
      item.lastError = undefined;
      store.sentToday += 1;
      succeeded++;
    } else {
      item.lastError = result.error;
      failed++;
      if (result.status === 429) {
        item.queueReason = "RATE_LIMIT_429";
        item.scheduledFor = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      } else {
        item.queueReason = "DAILY_LIMIT_REACHED";
        item.scheduledFor = getNextUtcMidnight().toISOString();
      }
    }

    saveStore();
  }

  quota = await getEmailQuotaStats();

  return {
    processed,
    succeeded,
    failed,
    remainingInQueue: store.queued.filter((q) => q.status === "queued").length,
    quota,
  };
}

/**
 * Retrieve queued items list for Admin view
 */
export async function getQueuedEmailsList(): Promise<QueuedEmail[]> {
  const store = loadStore();
  return [...store.queued].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Manually force-send or retry a single queued email
 */
export async function retryQueuedEmail(queueId: string): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const store = loadStore();
  const item = store.queued.find((q) => q.id === queueId);
  if (!item) {
    return { success: false, error: "Queued email not found." };
  }

  const result = await callResendApi({
    to: item.to,
    subject: item.subject,
    html: item.html,
  });

  if (result.ok) {
    item.status = "sent";
    item.sentAt = new Date().toISOString();
    item.resendMessageId = result.messageId;
    item.lastError = undefined;
    store.sentToday += 1;
    saveStore();
    return { success: true, messageId: result.messageId };
  }

  item.lastError = result.error;
  item.attempts += 1;
  saveStore();
  return { success: false, error: result.error };
}

