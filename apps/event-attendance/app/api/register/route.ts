import { NextRequest, NextResponse } from "next/server";
import {
  registerNewAttendee,
  fetchEventById,
  checkEventCapacityAndDuplicate,
} from "@/lib/repository";
import { generateTicketEmailHtml } from "@/lib/email-template";
import { sendOrQueueTicketEmail } from "@/lib/email-service";
import { validateRegistrationPayload } from "@/lib/validation";

// In-memory sliding window IP rate limiter (protects against registration spam bots)
const ipRateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 5; // Max 5 registrations per IP per minute

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

function isRateLimited(ip: string): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const timestamps = ipRateLimitMap.get(ip) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = validTimestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000));
    ipRateLimitMap.set(ip, validTimestamps);
    return { limited: true, retryAfterSeconds };
  }

  validTimestamps.push(now);
  ipRateLimitMap.set(ip, validTimestamps);
  return { limited: false, retryAfterSeconds: 0 };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { websiteUrl } = body;

    // 1. Honeypot Bot Trap Check
    if (websiteUrl && String(websiteUrl).trim().length > 0) {
      console.warn("[Abuse Protection] Honeypot triggered by bot submission:", {
        email: body.email,
        eventId: body.eventId,
      });
      return NextResponse.json(
        { error: "Automated bot submission detected and blocked." },
        { status: 403 }
      );
    }

    // 2. IP Rate Limiting Check
    const clientIp = getClientIp(req);
    const rateCheck = isRateLimited(clientIp);
    if (rateCheck.limited) {
      return NextResponse.json(
        {
          error: `Too many registration requests from this network. Please wait ${rateCheck.retryAfterSeconds}s and try again.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateCheck.retryAfterSeconds) },
        }
      );
    }

    // 3. Strict Field Validation & PHP / Script / NoSQL Injection Guard
    const validation = validateRegistrationPayload(body);
    if (!validation.valid || !validation.data) {
      return NextResponse.json(
        {
          error: validation.error || "Invalid registration fields.",
          fieldErrors: validation.fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      eventId,
      fullName,
      email,
      phone,
      organization,
      jobTitle,
      ticketType,
      customData,
    } = validation.data;

    const event = await fetchEventById(eventId);
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    // 4. Venue Capacity & Duplicate Email Protection (O(1) Indexed MongoDB Check)
    const { registeredCount, existingDuplicate } =
      await checkEventCapacityAndDuplicate(event.id, email);

    const protocol = req.headers.get("x-forwarded-proto") || "https";
    const host =
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      "localhost:3002";
    const appBaseUrl = `${protocol}://${host}`;

    if (existingDuplicate) {
      const emailHtml = generateTicketEmailHtml({
        event,
        attendee: existingDuplicate,
        appBaseUrl,
      });

      return NextResponse.json({
        success: true,
        duplicateRecovered: true,
        attendee: existingDuplicate,
        emailSent: false,
        emailStatus: "already_registered",
        emailPreviewHtml: emailHtml,
        ticketUrl: `${appBaseUrl}/ticket/${encodeURIComponent(existingDuplicate.id)}`,
      });
    }

    if (event.capacity && registeredCount >= event.capacity) {
      return NextResponse.json(
        {
          error: `Registration closed: ${event.title} has reached its maximum venue capacity (${event.capacity} seats).`,
        },
        { status: 409 }
      );
    }

    const attendee = await registerNewAttendee({
      eventId: event.id,
      fullName,
      email,
      phone,
      organization,
      jobTitle,
      ticketType,
      customData,
    });

    // Delivery via Resend with Daily Limit & Queue Protection
    const delivery = await sendOrQueueTicketEmail({
      event,
      attendee,
      appBaseUrl,
    });

    const emailHtml = generateTicketEmailHtml({
      event,
      attendee,
      appBaseUrl,
    });

    return NextResponse.json({
      success: true,
      attendee,
      emailSent: delivery.delivered,
      emailStatus: delivery.status, // "sent" | "queued" | "mock_sent"
      queueReason: delivery.queueReason,
      quotaStats: delivery.stats,
      emailPreviewHtml: emailHtml,
      ticketUrl: `${appBaseUrl}/ticket/${encodeURIComponent(attendee.id)}`,
    });
  } catch (err: unknown) {
    console.error("Registration failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
