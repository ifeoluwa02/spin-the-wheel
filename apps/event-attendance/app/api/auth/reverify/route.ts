import { NextRequest, NextResponse } from "next/server";
import { fetchEventById } from "@/lib/repository";
import {
  createSignedSession,
  verifySuperAdminCredentials,
  verifyEventAdminCredentials,
  verifyUsherPin,
  SUPER_ADMIN_EMAIL,
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
          error: `Too many failed verification attempts. Please wait ${rateLimit.retryAfterSeconds}s.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const { role, credential, eventId, email } = await request.json();

    if (!role || !credential) {
      return NextResponse.json(
        { error: "Role and credential are required." },
        { status: 400 }
      );
    }

    if (
      containsMaliciousPayload(role) ||
      containsMaliciousPayload(credential) ||
      (eventId && containsMaliciousPayload(eventId)) ||
      (email && containsMaliciousPayload(email))
    ) {
      recordAuthFailure(clientIp);
      return NextResponse.json(
        { error: "Rejected: Disallowed injection characters detected." },
        { status: 400 }
      );
    }

    const cleanCred = String(credential).trim();

    if (role === "super-admin") {
      const isValid = verifySuperAdminCredentials(email || SUPER_ADMIN_EMAIL, cleanCred);
      if (!isValid) {
        recordAuthFailure(clientIp);
        return NextResponse.json({ error: "Incorrect Super-Admin password." }, { status: 401 });
      }
      clearAuthFailures(clientIp);
      const token = createSignedSession({
        role: "super-admin",
        email: SUPER_ADMIN_EMAIL,
        name: "Super Admin",
      });
      const res = NextResponse.json({ success: true, lastVerifiedAt: Date.now(), token });
      res.cookies.set("super_admin_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60,
      });
      return res;
    }

    let event = null;
    if (eventId) {
      event = await fetchEventById(sanitizeText(eventId, 90));
    }

    if (role === "admin") {
      const cleanEmail = (email || event?.adminEmail || "admin@event.internal").trim().toLowerCase();
      const isValid = verifyEventAdminCredentials(event, cleanEmail, cleanCred);
      if (!isValid) {
        recordAuthFailure(clientIp);
        return NextResponse.json({ error: "Incorrect Event Admin password." }, { status: 401 });
      }
      clearAuthFailures(clientIp);
      const token = createSignedSession({
        role: "admin",
        email: cleanEmail,
        name: event?.organizer || "Event Admin",
        eventId: event?.id,
        eventSlug: event?.slug,
        eventName: event?.title,
      });
      const res = NextResponse.json({ success: true, lastVerifiedAt: Date.now(), token });
      res.cookies.set("event_admin_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60,
      });
      return res;
    }

    if (role === "usher") {
      const isValid = verifyUsherPin(event, cleanCred);
      if (!isValid) {
        recordAuthFailure(clientIp);
        return NextResponse.json({ error: "Incorrect Gate Usher PIN." }, { status: 401 });
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
      const res = NextResponse.json({ success: true, lastVerifiedAt: Date.now(), token });
      res.cookies.set("usher_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60,
      });
      return res;
    }

    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  } catch (err: unknown) {
    console.error("Reverify error:", err);
    return NextResponse.json({ error: "Re-verification failed." }, { status: 500 });
  }
}
