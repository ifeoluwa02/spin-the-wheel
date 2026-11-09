import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";
import {
  getAllCampaigns,
  getOrSyncCampaignAnalytics,
  getParticipants,
} from "@/lib/campaign";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const superAdminCookie = request.cookies.get("super_admin_session")?.value;
    const session = superAdminCookie ? verifySignedSession(superAdminCookie) : null;

    if (!session || session.role !== "super-admin") {
      return NextResponse.json(
        { error: "Unauthorized. Super Admin login required.", expired: true },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const forceSync = searchParams.get("sync") === "true";

    const campaigns = await getAllCampaigns();
    let globalTotalSpins = 0;
    let globalTotalWinners = 0;
    const campaignStats: Record<string, { spins: number; winners: number }> = {};
    const recentParticipants: any[] = [];

    await Promise.all(
      campaigns.map(async (c) => {
        const cid = c.id || "";
        if (!cid) return;
        const [analytics, recent] = await Promise.all([
          getOrSyncCampaignAnalytics(cid, forceSync),
          getParticipants(cid, 12),
        ]);
        campaignStats[cid] = {
          spins: analytics.totalSpins,
          winners: analytics.totalWinners,
        };
        globalTotalSpins += analytics.totalSpins;
        globalTotalWinners += analytics.totalWinners;
        recentParticipants.push(...recent);
      })
    );

    recentParticipants.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({
      success: true,
      globalTotalSpins,
      globalTotalWinners,
      campaignStats,
      participants: recentParticipants.slice(0, 50),
    });
  } catch (err: any) {
    console.error("API /api/super-admin/analytics GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch super admin analytics." },
      { status: 500 }
    );
  }
}
