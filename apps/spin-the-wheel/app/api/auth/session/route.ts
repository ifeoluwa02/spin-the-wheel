import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  try {
    const campaignCookie = request.cookies.get("campaign_session")?.value;
    const superAdminCookie = request.cookies.get("super_admin_session")?.value;
    const baCookie = request.cookies.get("ba_session")?.value;

    const campaignSession = campaignCookie ? verifySignedSession(campaignCookie) : null;
    const superAdminSession = superAdminCookie ? verifySignedSession(superAdminCookie) : null;
    const baSession = baCookie ? verifySignedSession(baCookie) : null;

    const isExpired =
      Boolean(campaignCookie && !campaignSession) ||
      Boolean(superAdminCookie && !superAdminSession) ||
      Boolean(baCookie && !baSession);

    const activeSession = campaignSession || superAdminSession || baSession;

    const response = NextResponse.json({
      authenticated: Boolean(activeSession),
      campaignSession,
      superAdminSession,
      baSession,
      expired: isExpired,
      expiresAt: activeSession?.exp || null,
    });

    // Automatically purge expired session cookies from the client
    if (campaignCookie && !campaignSession) {
      response.cookies.set("campaign_session", "", { path: "/", maxAge: 0 });
    }
    if (superAdminCookie && !superAdminSession) {
      response.cookies.set("super_admin_session", "", { path: "/", maxAge: 0 });
    }
    if (baCookie && !baSession) {
      response.cookies.set("ba_session", "", { path: "/", maxAge: 0 });
    }

    return response;
  } catch (err) {
    return NextResponse.json({
      authenticated: false,
      campaignSession: null,
      superAdminSession: null,
      baSession: null,
      expired: false,
      expiresAt: null,
    });
  }
}
