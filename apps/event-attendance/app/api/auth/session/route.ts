import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const eventAdminCookie = request.cookies.get("event_admin_session")?.value;
    const superAdminCookie = request.cookies.get("super_admin_session")?.value;
    const usherCookie = request.cookies.get("usher_session")?.value;

    const eventAdminSession = eventAdminCookie ? verifySignedSession(eventAdminCookie) : null;
    const superAdminSession = superAdminCookie ? verifySignedSession(superAdminCookie) : null;
    const usherSession = usherCookie ? verifySignedSession(usherCookie) : null;

    const activeSession = superAdminSession || eventAdminSession || usherSession;

    const isExpired =
      Boolean(eventAdminCookie && !eventAdminSession) ||
      Boolean(superAdminCookie && !superAdminSession) ||
      Boolean(usherCookie && !usherSession);

    const response = NextResponse.json({
      authenticated: Boolean(activeSession),
      session: activeSession,
      role: activeSession?.role || null,
      expired: isExpired,
      expiresAt: activeSession?.exp || null,
    });

    if (eventAdminCookie && !eventAdminSession) {
      response.cookies.set("event_admin_session", "", { path: "/", maxAge: 0 });
    }
    if (superAdminCookie && !superAdminSession) {
      response.cookies.set("super_admin_session", "", { path: "/", maxAge: 0 });
    }
    if (usherCookie && !usherSession) {
      response.cookies.set("usher_session", "", { path: "/", maxAge: 0 });
    }

    return response;
  } catch {
    return NextResponse.json({
      authenticated: false,
      session: null,
      role: null,
      expired: false,
      expiresAt: null,
    });
  }
}
