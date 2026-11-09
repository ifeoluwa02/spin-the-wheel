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
    const fromTsParam = Number(searchParams.get("fromTs")) || (fromDate ? new Date(fromDate + "T00:00:00").getTime() : 0);
    const toTsParam = Number(searchParams.get("toTs")) || (toDate ? new Date(toDate + "T23:59:59").getTime() : 0);

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

    const activeStoreFilter = storeParam && storeParam !== "all" ? storeParam : undefined;
    const isComplexFilter = Boolean(
      searchParam ||
      fromTsParam > 0 ||
      toTsParam > 0 ||
      (session.role === "supervisor" && session.scopeType === "stores")
    );
    const isAnyFilterActive = Boolean(activeStoreFilter || isComplexFilter);

    const applyFilters = (list: any[]) => {
      let result = list;

      // If supervisor, scope participants
      if (session.role === "supervisor" && session.scopeType === "stores" && session.storeIds?.length) {
        const allowed = new Set(session.storeIds.map((s) => s.toLowerCase()));
        result = result.filter(
          (p) => p.storeCode && allowed.has(p.storeCode.toLowerCase())
        );
      }

      // Filter by store
      if (activeStoreFilter) {
        const normStore = activeStoreFilter.toLowerCase();
        result = result.filter(
          (p) =>
            p.storeCode?.toLowerCase() === normStore ||
            p.storeName?.toLowerCase() === normStore
        );
      }

      // Filter by search across all table columns
      if (searchParam) {
        result = result.filter(
          (p) =>
            p.name?.toLowerCase().includes(searchParam) ||
            p.phone?.includes(searchParam) ||
            (p.email && p.email.toLowerCase().includes(searchParam)) ||
            p.prizeLabel?.toLowerCase().includes(searchParam) ||
            (p.storeName && p.storeName.toLowerCase().includes(searchParam)) ||
            (p.storeCode && p.storeCode.toLowerCase().includes(searchParam)) ||
            (p.voucherCode && p.voucherCode.toLowerCase().includes(searchParam))
        );
      }

      // Filter by date range
      if (fromTsParam > 0) {
        result = result.filter((p) => (p.createdAt || 0) >= fromTsParam);
      }
      if (toTsParam > 0) {
        result = result.filter((p) => (p.createdAt || 0) <= toTsParam);
      }

      return result;
    };

    // 2. Full Export Endpoint (Called on-demand when admin clicks 'Export to CSV')
    if (isExport) {
      const rawParticipants = await getParticipants(campaignId, {
        storeCode: activeStoreFilter,
      });
      const participants = applyFilters(rawParticipants);

      return NextResponse.json({
        success: true,
        participants,
        totalCount: participants.length,
      });
    }

    // 3. Paginated Participant Query (Fast & Lightweight)
    // Never pass limit: undefined during interactive table pagination/filtering on 27k+ records
    const neededCount = page * pageSize;
    const boundedScanLimit = isAnyFilterActive ? Math.max(neededCount, 500) : neededCount;

    const [analytics, storeCounts, participantsRaw] = await Promise.all([
      getOrSyncCampaignAnalytics(campaignId),
      activeStoreFilter && !isComplexFilter
        ? getParticipantCounts(campaignId, activeStoreFilter)
        : Promise.resolve({ total: 0, winners: 0 }),
      getParticipants(campaignId, {
        limit: boundedScanLimit,
        storeCode: activeStoreFilter,
      }),
    ]);

    const allTotalCount = Math.max(analytics.totalSpins || 0, participantsRaw.length);
    const winnersCount = Math.max(
      analytics.totalWinners || 0,
      participantsRaw.filter((p) => p.won).length
    );

    const filtered = applyFilters(participantsRaw);

    let filteredTotal = allTotalCount;
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
      isFiltered: isAnyFilterActive,
      totalCount: filteredTotal,
      allTotalCount,
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
