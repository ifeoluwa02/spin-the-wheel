import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";
import {
  getParticipants,
  getOrSyncCampaignAnalytics,
  getParticipantCounts,
  getAllStoreInventories,
} from "@/lib/campaign";

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

    const isExport = searchParams.get("export") === "true";
    const isStatsOnly = searchParams.get("stats") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.max(10, Math.min(200, parseInt(searchParams.get("pageSize") || searchParams.get("limit") || "50", 10)));
    const storeParam = (searchParams.get("store") || "").trim();
    const searchParam = (searchParams.get("search") || "").trim().toLowerCase();
    const fromDate = searchParams.get("from") || "";
    const toDate = searchParams.get("to") || "";

    // 1. Fast Stats Only Endpoint
    if (isStatsOnly) {
      const [analytics, storeInventories] = await Promise.all([
        getOrSyncCampaignAnalytics(campaignId),
        getAllStoreInventories(campaignId),
      ]);

      return NextResponse.json({
        success: true,
        totalCount: analytics.totalSpins,
        winnersCount: analytics.totalWinners,
        prizeCounts: analytics.prizeCounts,
        storeInventories,
        storesSummary: analytics.stores || {},
      });
    }

    // 2. Full Export Endpoint (Called on-demand when admin clicks 'Export to CSV')
    if (isExport) {
      let participants = await getParticipants(campaignId);

      // If supervisor, scope participants
      if (session.role === "supervisor" && session.scopeType === "stores" && session.storeIds?.length) {
        const allowed = new Set(session.storeIds.map((s) => s.toLowerCase()));
        participants = participants.filter(
          (p) => p.storeCode && allowed.has(p.storeCode.toLowerCase())
        );
      }

      // Filter by store
      if (storeParam && storeParam !== "all") {
        participants = participants.filter((p) => p.storeCode?.toLowerCase() === storeParam.toLowerCase());
      }

      // Filter by search
      if (searchParam) {
        participants = participants.filter((p) =>
          p.name?.toLowerCase().includes(searchParam) ||
          p.phone?.includes(searchParam) ||
          (p.email && p.email.toLowerCase().includes(searchParam)) ||
          p.prizeLabel?.toLowerCase().includes(searchParam)
        );
      }

      // Filter by date range
      if (fromDate) {
        const fromTs = new Date(fromDate + "T00:00:00").getTime();
        participants = participants.filter((p) => (p.createdAt || 0) >= fromTs);
      }
      if (toDate) {
        const toTs = new Date(toDate + "T23:59:59").getTime();
        participants = participants.filter((p) => (p.createdAt || 0) <= toTs);
      }

      return NextResponse.json({
        success: true,
        participants,
        totalCount: participants.length,
      });
    }

    // 3. Paginated Participant Query (Fast & Lightweight)
    const activeStoreFilter = storeParam && storeParam !== "all" ? storeParam : undefined;
    const isComplexFilter = Boolean(searchParam || fromDate || toDate || (session.role === "supervisor" && session.scopeType === "stores"));
    const neededCount = page * pageSize;

    const [analytics, storeCounts, participantsRaw] = await Promise.all([
      getOrSyncCampaignAnalytics(campaignId),
      activeStoreFilter ? getParticipantCounts(campaignId, activeStoreFilter) : Promise.resolve({ total: 0, winners: 0 }),
      getParticipants(campaignId, {
        limit: isComplexFilter ? undefined : neededCount,
        storeCode: activeStoreFilter,
      }),
    ]);

    let participants = participantsRaw;

    // If supervisor, scope participants
    if (session.role === "supervisor" && session.scopeType === "stores" && session.storeIds?.length) {
      const allowed = new Set(session.storeIds.map((s) => s.toLowerCase()));
      participants = participants.filter(
        (p) => p.storeCode && allowed.has(p.storeCode.toLowerCase())
      );
    }

    const totalCount = Math.max(analytics.totalSpins || 0, participants.length);
    const winnersCount = Math.max(analytics.totalWinners || 0, participants.filter((p) => p.won).length);

    // Apply store filter if not done by query
    let filtered = participants;
    if (activeStoreFilter) {
      filtered = filtered.filter((p) => p.storeCode?.toLowerCase() === activeStoreFilter.toLowerCase());
    }

    // Apply search filter
    if (searchParam) {
      filtered = filtered.filter((p) =>
        p.name?.toLowerCase().includes(searchParam) ||
        p.phone?.includes(searchParam) ||
        (p.email && p.email.toLowerCase().includes(searchParam)) ||
        p.prizeLabel?.toLowerCase().includes(searchParam)
      );
    }

    // Apply date range filter
    if (fromDate) {
      const fromTs = new Date(fromDate + "T00:00:00").getTime();
      filtered = filtered.filter((p) => (p.createdAt || 0) >= fromTs);
    }
    if (toDate) {
      const toTs = new Date(toDate + "T23:59:59").getTime();
      filtered = filtered.filter((p) => (p.createdAt || 0) <= toTs);
    }

    let filteredTotal = totalCount;
    if (isComplexFilter) {
      filteredTotal = filtered.length;
    } else if (activeStoreFilter) {
      const cleanStoreKey = activeStoreFilter.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const storeSummarySpins = analytics.stores?.[cleanStoreKey]?.spins || 0;
      filteredTotal = Math.max(storeCounts.total || 0, storeSummarySpins, filtered.length);
    }

    const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
    const startIndex = (page - 1) * pageSize;
    const paginatedSlice = filtered.slice(startIndex, startIndex + pageSize);

    return NextResponse.json({
      success: true,
      participants: paginatedSlice,
      page,
      pageSize,
      totalCount: filteredTotal,
      allTotalCount: totalCount,
      totalPages,
      winnersCount,
    });
  } catch (err: any) {
    console.error("API /api/admin/participants error:", err);
    return NextResponse.json(
      { error: "Failed to fetch participants." },
      { status: 500 }
    );
  }
}
