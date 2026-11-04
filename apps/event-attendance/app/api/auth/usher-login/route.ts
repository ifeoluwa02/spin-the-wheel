import { NextRequest, NextResponse } from "next/server";
import { fetchEventById } from "@/lib/repository";
import {
  createSignedSession,
  verifyUsherPin,
  getRequestIp,
  checkAuthRateLimit,
  recordAuthFailure,
  clearAuthFailures,
} from "@/lib/auth";
import { containsMaliciousPayload, sanitizeText } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const clientIp = getRequestIp(request);
    const rateLimit = checkAuthRateLimit(clientIp);
    if (rateLimit.blocked) {
      return NextResponse.json(
        {
          error: `Too many failed PIN attempts. Please wait ${rateLimit.retryAfterSeconds}s before trying again.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const { eventId, pin } = await request.json();

    if (!pin) {
      return NextResponse.json(
        { error: "PIN is required." },
        { status: 400 }
      );
    }

    if (
      containsMaliciousPayload(pin) ||
      (eventId && containsMaliciousPayload(eventId))
    ) {
      recordAuthFailure(clientIp);
      return NextResponse.json(
        { error: "Rejected: Disallowed injection characters detected." },
        { status: 400 }
      );
    }

    let event = null;
    if (eventId) {
      event = await fetchEventById(sanitizeText(eventId, 90));
    }

    const isValid = verifyUsherPin(event, String(pin));

    if (!isValid) {
      recordAuthFailure(clientIp);
      return NextResponse.json(
        { error: "Invalid Gate Usher PIN." },
        { status: 401 }
      );
    }

    clearAuthFailures(clientIp);

    const token = createSignedSession({
      role: "usher",
      email: `${event?.slug || "general"}-gate@usher.internal`,
      name: "Gate Usher",
      eventId: event?.id,
      eventSlug: event?.slug,
      eventName: event?.title,
    });

    const expiresAt = Date.now() + 60 * 60 * 1000;

    const response = NextResponse.json({
      success: true,
      user: {
        role: "usher" as const,
        email: `${event?.slug || "general"}-gate@usher.internal`,
        name: "Gate Usher",
        eventId: event?.id,
        eventSlug: event?.slug,
        eventName: event?.title,
      },
      token,
      expiresAt,
    });

    response.cookies.set("usher_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60,
    });

    return response;
  } catch (err: unknown) {
    console.error("API /api/auth/usher-login error:", err);
    return NextResponse.json(
      { error: "Usher authentication failed." },
      { status: 500 }
    );
  }
}
