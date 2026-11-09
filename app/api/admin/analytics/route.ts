import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";
import {
  getOrSyncCampaignAnalytics,
  getAllStoreInventories,
} from "@/lib/campaign";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId") || searchParams.get("c") || "";
    const forceSync = searchParams.get("sync") === "true";

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

    const [analytics, storeInventories] = await Promise.all([
      getOrSyncCampaignAnalytics(campaignId, forceSync),
      getAllStoreInventories(campaignId),
    ]);

    return NextResponse.json({
      success: true,
      totalCount: analytics.totalSpins,
      winnersCount: analytics.totalWinners,
      prizeCounts: analytics.prizeCounts,
      storeInventories: storeInventories || {},
      storesSummary: analytics.stores || {},
    });
  } catch (err: any) {
    console.error("API /api/admin/analytics GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch campaign analytics." },
      { status: 500 }
    );
  }
}

