import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";
import { getParticipants } from "@/lib/campaign";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId") || searchParams.get("c") || "";

    if (!campaignId) {
      return NextResponse.json(
        { error: "Campaign ID is required." },
        { status: 400 }
      );
    }

    // Authenticate session
    const campaignCookie = request.cookies.get("campaign_session")?.value;
    const superAdminCookie = request.cookies.get("super_admin_session")?.value;

    const campaignSession = campaignCookie ? verifySignedSession(campaignCookie) : null;
    const superAdminSession = superAdminCookie ? verifySignedSession(superAdminCookie) : null;

    const session = superAdminSession || campaignSession;
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in.", expired: true },
        { status: 401 }
      );
    }

    // Authorization check
    if (session.role === "admin" || session.role === "supervisor") {
      if (session.campaignId && session.campaignId !== campaignId) {
        return NextResponse.json(
          { error: "Forbidden. You do not have access to this campaign." },
          { status: 403 }
        );
      }
    } else if (session.role !== "super-admin") {
      return NextResponse.json(
        { error: "Forbidden. Insufficient permissions." },
        { status: 403 }
      );
    }

    // Fetch participants server-side
    let participants = await getParticipants(campaignId);

    // If supervisor, scope participants
    if (session.role === "supervisor") {
      if (session.scopeType === "stores" && session.storeIds?.length) {
        const allowed = new Set(session.storeIds.map((s) => s.toLowerCase()));
        participants = participants.filter(
          (p) => p.storeCode && allowed.has(p.storeCode.toLowerCase())
        );
      }
    }

    return NextResponse.json({
      success: true,
      participants,
    });
  } catch (err: any) {
    console.error("API /api/admin/participants error:", err);
    return NextResponse.json(
      { error: "Failed to fetch participants." },
      { status: 500 }
    );
  }
}
