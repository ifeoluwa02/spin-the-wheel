import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";
import {
  getAllCampaigns,
  getAllGlobalParticipants,
  getCampaignAnalytics,
  getParticipantCounts,
  getParticipants,
} from "@/lib/campaign";
import type { Participant } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const superAdminCookie = request.cookies.get("super_admin_session")?.value;
    const session = superAdminCookie ? verifySignedSession(superAdminCookie) : null;

    if (!session || session.role !== "super-admin") {
      return NextResponse.json(
        { error: "Unauthorized. Super Admin access required." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const isExport = searchParams.get("export") === "true";

    // On-demand full export when Super Admin clicks 'Export All'
    if (isExport) {
      const participants = await getAllGlobalParticipants();
      return NextResponse.json({
        success: true,
        participants,
      });
    }

    // Lightweight dashboard load: fetch campaigns + fast O(1)/index counts + recent 20 spins per campaign
    const campaigns = await getAllCampaigns();

    const campaignStats: Record<string, { spins: number; winners: number }> = {};
    let globalTotalSpins = 0;
    let globalTotalWinners = 0;
    const recentParticipants: Participant[] = [];

    await Promise.all(
      campaigns.map(async (c) => {
        const cid = c.id;
        if (!cid) return;
        const [summary, counts, recent] = await Promise.all([
          getCampaignAnalytics(cid),
          getParticipantCounts(cid),
          getParticipants(cid, 25),
        ]);

        const spins = Math.max(summary?.totalSpins || 0, counts.total || 0, recent.length);
        const winners = Math.max(
          summary?.totalWinners || 0,
          counts.winners || 0,
          recent.filter((p) => p.won).length
        );

        campaignStats[cid] = { spins, winners };
        globalTotalSpins += spins;
        globalTotalWinners += winners;
        recentParticipants.push(...recent);
      })
    );

    recentParticipants.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({
      success: true,
      campaigns,
      participants: recentParticipants.slice(0, 50),
      globalTotalSpins,
      globalTotalWinners,
      campaignStats,
    });
  } catch (err: any) {
    console.error("API /api/super-admin/data error:", err);
    return NextResponse.json(
      { error: "Failed to fetch super admin data." },
      { status: 500 }
    );
  }
}
