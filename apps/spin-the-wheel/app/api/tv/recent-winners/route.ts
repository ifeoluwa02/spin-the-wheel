import { NextRequest, NextResponse } from "next/server";
import { getParticipants } from "@/lib/campaign";

export const dynamic = "force-dynamic";

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

    const participants = await getParticipants(campaignId);
    const totalSpins = participants.length;
    const winnersList = participants.filter((p) => p.won);
    const winRate = totalSpins ? Math.round((winnersList.length / totalSpins) * 100) : 0;

    // Mask name for privacy if full name provided (e.g. "Akin Omisakin" -> "Akin O.")
    // Strictly omit phone, email, and voucherCode from the response!
    const sanitizedWinners = winnersList.slice(0, 25).map((p) => {
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

    return NextResponse.json({
      success: true,
      totalSpins,
      winRate,
      winners: sanitizedWinners,
    });
  } catch (err: any) {
    console.error("API /api/tv/recent-winners error:", err);
    return NextResponse.json(
      { error: "Failed to fetch winners." },
      { status: 500 }
    );
  }
}
