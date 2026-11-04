import { NextRequest, NextResponse } from "next/server";
import { fetchEventById, upgradeEventAdminPasswordHash } from "@/lib/repository";
import {
  createSignedSession,
  verifyEventAdminCredentials,
  hashPassword,
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
          error: `Too many failed login attempts. Please wait ${rateLimit.retryAfterSeconds}s before trying again.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const { eventId, email, password } = await request.json();

    if (!eventId || !email || !password) {
      return NextResponse.json(
        { error: "Event ID, email, and password are required." },
        { status: 400 }
      );
    }

    if (
      containsMaliciousPayload(eventId) ||
      containsMaliciousPayload(email) ||
      containsMaliciousPayload(password)
    ) {
      recordAuthFailure(clientIp);
      return NextResponse.json(
        { error: "Rejected: Disallowed injection characters detected." },
        { status: 400 }
      );
    }

    const event = await fetchEventById(sanitizeText(eventId, 90));
    if (!event) {
      return NextResponse.json(
        { error: "Event not found." },
        { status: 404 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password);

    const isValid = verifyEventAdminCredentials(event, cleanEmail, cleanPassword);

    if (!isValid) {
      recordAuthFailure(clientIp);
      return NextResponse.json(
        { error: "Invalid email or password for this event." },
        { status: 401 }
      );
    }

    clearAuthFailures(clientIp);

    // Auto-upgrade legacy plaintext event admin password in MongoDB to salted PBKDF2 hash
    if (
      event.adminEmail &&
      event.adminEmail.toLowerCase().trim() === cleanEmail &&
      event.adminPassword &&
      !event.adminPassword.includes(":")
    ) {
      upgradeEventAdminPasswordHash(event.id, hashPassword(cleanPassword)).catch(
        (err) => console.warn("Password hash auto-upgrade warning:", err)
      );
    }

    // Issue signed 1-hour session token
    const token = createSignedSession({
      role: "admin",
      email: cleanEmail,
      name: event.organizer || "Event Admin",
      eventId: event.id,
      eventSlug: event.slug,
      eventName: event.title,
    });

    const expiresAt = Date.now() + 60 * 60 * 1000;

    const response = NextResponse.json({
      success: true,
      user: {
        role: "admin" as const,
        email: cleanEmail,
        name: event.organizer || "Event Admin",
        eventId: event.id,
        eventSlug: event.slug,
        eventName: event.title,
      },
      token,
      expiresAt,
    });

    response.cookies.set("event_admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60,
    });

    return response;
  } catch (err: unknown) {
    console.error("API /api/auth/login error:", err);
    return NextResponse.json(
      { error: "Authentication failed. Check your connection." },
      { status: 500 }
    );
  }
}
