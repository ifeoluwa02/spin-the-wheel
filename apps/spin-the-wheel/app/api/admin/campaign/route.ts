import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";
import { getCampaign, updateCampaign } from "@/lib/campaign";
import type { Campaign } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId") || searchParams.get("c") || "";

    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required." }, { status: 400 });
    }

    const campaign = await getCampaign(campaignId, true);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, campaign });
  } catch (err: any) {
    console.error("API GET /api/admin/campaign error:", err);
    return NextResponse.json({ error: "Failed to fetch campaign." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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

    // Only admin or super-admin can modify campaign structure
    if (session.role !== "admin" && session.role !== "super-admin") {
      return NextResponse.json(
        { error: "Forbidden. Supervisors cannot edit campaign settings." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updatedCampaign: Campaign = body.campaign;

    if (!updatedCampaign || !updatedCampaign.id) {
      return NextResponse.json({ error: "Invalid campaign payload." }, { status: 400 });
    }

    if (session.role === "admin" && session.campaignId !== updatedCampaign.id) {
      return NextResponse.json(
        { error: "Forbidden. You cannot edit another campaign." },
        { status: 403 }
      );
    }

    // Update campaign in Firestore server-side
    await updateCampaign(updatedCampaign);

    return NextResponse.json({ success: true, campaign: updatedCampaign });
  } catch (err: any) {
    console.error("API POST /api/admin/campaign error:", err);
    return NextResponse.json({ error: "Failed to save campaign." }, { status: 500 });
  }
}
