import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  try {
    const campaignCookie = request.cookies.get("campaign_session")?.value;
    const superAdminCookie = request.cookies.get("super_admin_session")?.value;

    let campaignSession = campaignCookie ? verifySignedSession(campaignCookie) : null;
    let superAdminSession = superAdminCookie ? verifySignedSession(superAdminCookie) : null;

    return NextResponse.json({
      authenticated: Boolean(campaignSession || superAdminSession),
      campaignSession,
      superAdminSession,
    });
  } catch (err) {
    return NextResponse.json({ authenticated: false, campaignSession: null, superAdminSession: null });
  }
}
