import { NextRequest, NextResponse } from "next/server";
import { getParticipants, getCampaignAnalytics } from "@/lib/campaign";

export const dynamic = "force-dynamic";

// 10-second in-memory cache so multiple TV screens polling simultaneously don't multiply Firestore reads
const tvWinnersCache = new Map<string, { payload: any; expiresAt: number }>();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("c") || "";

    if (!campaignId) {
      return NextResponse.json(
        { error: "Campaign ID required." },
        { status: 400 }
      );
    }

    const cached = tvWinnersCache.get(campaignId);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload);
    }

    const [participants, summary] = await Promise.all([
      getParticipants(campaignId, 20),
      getCampaignAnalytics(campaignId),
    ]);

    const totalSpins = summary?.totalSpins || participants.length;
    const winnersList = participants.filter((p) => p.won);
    const totalWinners = summary?.totalWinners || winnersList.length;
    const winRate = totalSpins ? Math.round((totalWinners / totalSpins) * 100) : 0;

    // Mask name for privacy if full name provided (e.g. "Akin Omisakin" -> "Akin O.")
    // Strictly omit phone, email, and voucherCode from the response!
    const sanitizedWinners = winnersList.slice(0, 20).map((p) => {
      const parts = (p.name || "Participant").trim().split(" ");
      const maskedName =
        parts.length > 1
          ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
          : parts[0];

      return {
        id: p.id,
        name: maskedName,
        prizeLabel: p.prizeLabel,
        storeName: p.storeName || "Store",
        createdAt: p.createdAt || Date.now(),
        won: true,
      };
    });

    const payload = {
      success: true,
      totalSpins,
      winRate,
      winners: sanitizedWinners,
    };

    tvWinnersCache.set(campaignId, { payload, expiresAt: Date.now() + 10_000 });

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("API /api/tv/recent-winners error:", err);
    return NextResponse.json(
      { error: "Failed to fetch winners." },
      { status: 500 }
    );
  }
}
