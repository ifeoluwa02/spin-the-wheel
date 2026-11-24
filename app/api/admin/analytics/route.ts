import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";
import {
  getOrSyncCampaignAnalytics,
  getAllStoreInventories,
  getStoreOrChainAnalytics,
} from "@/lib/campaign";

export const dynamic = "force-dynamic";

// In-memory 60-second TTL cache for store and chain level analytics
const storeAnalyticsCache = new Map<
  string,
  {
    data: {
      totalCount: number;
      winnersCount: number;
      prizeCounts: Record<string, number>;
    };
    expiresAt: number;
  }
>();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId") || searchParams.get("c") || "";
    const forceSync = searchParams.get("sync") === "true";
    const store = (searchParams.get("store") || "").trim();
    const storeCodesParam = (searchParams.get("storeCodes") || "").trim();

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

    // If specific store or storeCodes were requested
    const targetCodes = storeCodesParam
      ? storeCodesParam.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean)
      : store && store !== "all"
      ? [store.toLowerCase()]
      : [];

    if (targetCodes.length > 0) {
      const cacheKey = `${campaignId}::${targetCodes.sort().join(",")}`;
      if (!forceSync) {
        const cached = storeAnalyticsCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return NextResponse.json({
            success: true,
            isFiltered: true,
            totalCount: cached.data.totalCount,
            winnersCount: cached.data.winnersCount,
            prizeCounts: cached.data.prizeCounts,
          });
        }
      }

      const stats = await getStoreOrChainAnalytics(campaignId, {
        storeCodes: targetCodes,
      });

      const responseData = {
        totalCount: stats.totalSpins,
        winnersCount: stats.totalWinners,
        prizeCounts: stats.prizeCounts,
      };

      storeAnalyticsCache.set(cacheKey, {
        data: responseData,
        expiresAt: Date.now() + 60_000, // 60s cache
      });

      return NextResponse.json({
        success: true,
        isFiltered: true,
        ...responseData,
      });
    }

    // Default: Campaign-wide aggregate analytics
    const [analytics, storeInventories] = await Promise.all([
      getOrSyncCampaignAnalytics(campaignId, forceSync),
      getAllStoreInventories(campaignId),
    ]);

    return NextResponse.json({
      success: true,
      isFiltered: false,
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
