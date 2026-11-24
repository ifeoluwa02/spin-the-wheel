"use client";

import React, { useState, useMemo, useEffect } from "react";
import type { Campaign, StoreLocation, Participant, Prize } from "@/types";
import {
  Trophy,
  Medal,
  Gift,
  MapPin,
  Building2,
  Store,
  Users,
  Search,
  ChevronDown,
  Download,
  RefreshCw,
  Info,
  ExternalLink,
  Sparkles,
  ArrowUpRight,
  Filter,
  Check,
} from "lucide-react";

interface StorePrizeAnalyticsProps {
  campaign: Campaign;
  campaignSlug: string;
  storeInventoriesMap: Record<
    string,
    { storeCode: string; claimedCounts: Record<string, number> }
  >;
  participants: Participant[];
  totalWinnersCount?: number;
  totalSpinsCount?: number;
  onNavigateToExport?: (storeCode?: string) => void;
  onRefreshData?: () => Promise<void>;
}

const VIBRANT_PALETTE = [
  "#f59e0b", // Gold / Amber (Golden Morn)
  "#4f46e5", // Indigo / Blue (Pen)
  "#9333ea", // Purple (Notepad)
  "#06b6d4", // Cyan (Water Bottle)
  "#10b981", // Emerald (Lunch Box)
  "#22c55e", // Green (Cereal Bowl)
  "#ec4899", // Pink (Napbag)
  "#f97316", // Orange (Lunch Bags)
  "#e11d48", // Rose
  "#14b8a6", // Teal
  "#3b82f6", // Sky Blue
  "#a855f7", // Violet
];

function getPrizeColor(prize: Prize, index: number): string {
  if (prize.color && prize.color !== "#000000" && prize.color !== "#111827") {
    // If color is very dark navy/black, brighten it for high contrast on dark glass cards
    if (prize.color.toLowerCase() === "#1e3a8a") return "#4f46e5";
    if (prize.color.toLowerCase() === "#166534") return "#16a34a";
    return prize.color;
  }
  return VIBRANT_PALETTE[index % VIBRANT_PALETTE.length];
}

/**
 * Matches a store with its corresponding storeInventory document.
 */
function getStoreInventory(
  store: StoreLocation,
  invMap: Record<string, { storeCode: string; claimedCounts: Record<string, number> }>
) {
  const rawCode = (store.code || "").trim().toLowerCase();
  const rawId = (store.id || "").trim().toLowerCase();
  const slugName = (store.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    invMap[rawCode] ||
    invMap[rawId] ||
    invMap[slugName] ||
    Object.values(invMap).find(
      (v) =>
        (v.storeCode && v.storeCode.toLowerCase() === rawCode) ||
        (v.storeCode && v.storeCode.toLowerCase() === rawId)
    ) ||
    null
  );
}

export default function StorePrizeAnalytics({
  campaign,
  campaignSlug,
  storeInventoriesMap,
  participants,
  totalWinnersCount = 0,
  totalSpinsCount = 0,
  onNavigateToExport,
  onRefreshData,
}: StorePrizeAnalyticsProps) {
  // Navigation Sub-tabs: "store_analysis" | "all_stores" | "winners_directory"
  const [subTab, setSubTab] = useState<"store_analysis" | "all_stores" | "winners_directory">("store_analysis");

  // Store Chain & Branch Filters
  const [selectedChain, setSelectedChain] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");

  // Interactive Hover on Donut Chart
  const [hoveredPrizeId, setHoveredPrizeId] = useState<string | null>(null);

  // Search & Filter for All Stores / Directory views
  const [allStoresSearch, setAllStoresSearch] = useState<string>("");
  const [directorySearch, setDirectorySearch] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const stores = useMemo(() => campaign.stores || [], [campaign.stores]);
  const prizes = useMemo(() => campaign.prizes || [], [campaign.prizes]);

  // Group stores by chain brand
  const chainsMap = useMemo(() => {
    const map = new Map<string, StoreLocation[]>();

    stores.forEach((store) => {
      const rawName = (store.name || "Unknown Store").trim();
      const existing = map.get(rawName) || [];
      existing.push(store);
      map.set(rawName, existing);
    });

    return map;
  }, [stores]);

  // Calculate total prizes per chain to rank them
  const chainsList = useMemo(() => {
    const list: Array<{
      name: string;
      stores: StoreLocation[];
      branchCount: number;
      totalPrizesWon: number;
    }> = [];

    chainsMap.forEach((chainStores, chainName) => {
      let chainTotal = 0;
      chainStores.forEach((s) => {
        const inv = getStoreInventory(s, storeInventoriesMap);
        if (inv?.claimedCounts) {
          Object.values(inv.claimedCounts).forEach((count) => {
            chainTotal += Number(count) || 0;
          });
        } else {
          const localWins = participants.filter(
            (p) =>
              (p.storeCode?.toLowerCase() === (s.code || "").toLowerCase() ||
                p.storeCode === s.id) &&
              p.won
          ).length;
          chainTotal += localWins;
        }
      });

      list.push({
        name: chainName,
        stores: chainStores,
        branchCount: chainStores.length,
        totalPrizesWon: chainTotal,
      });
    });

    // Sort descending by total prizes won, then alphabetically
    return list.sort((a, b) => b.totalPrizesWon - a.totalPrizesWon || a.name.localeCompare(b.name));
  }, [chainsMap, storeInventoriesMap, participants]);

  // Set default selectedChain on mount if not selected
  useEffect(() => {
    if (!selectedChain && chainsList.length > 0) {
      // Find "Justrite" if it exists, otherwise use top chain
      const justrite = chainsList.find((c) => c.name.toLowerCase().includes("justrite"));
      setSelectedChain(justrite ? justrite.name : chainsList[0].name);
    }
  }, [chainsList, selectedChain]);

  // Stores matching currently selected chain & branch filter
  const currentMatchingStores = useMemo(() => {
    if (!selectedChain || selectedChain === "all") {
      return stores;
    }

    const chainStores = chainsMap.get(selectedChain) || [];
    if (selectedBranchId === "all") {
      return chainStores;
    }

    return chainStores.filter((s) => s.id === selectedBranchId || s.code === selectedBranchId);
  }, [selectedChain, selectedBranchId, chainsMap, stores]);

  // Available branches for current chain
  const availableBranches = useMemo(() => {
    if (!selectedChain || selectedChain === "all") {
      return [];
    }
    return chainsMap.get(selectedChain) || [];
  }, [selectedChain, chainsMap]);

  // Compute Prize Distributions & Totals for current selection
  const analyticsData = useMemo(() => {
    const countsByPrize: Record<string, number> = {};

    currentMatchingStores.forEach((s) => {
      const inv = getStoreInventory(s, storeInventoriesMap);
      if (inv?.claimedCounts) {
        Object.entries(inv.claimedCounts).forEach(([prizeId, count]) => {
          countsByPrize[prizeId] = (countsByPrize[prizeId] || 0) + (Number(count) || 0);
        });
      } else {
        prizes.forEach((prize) => {
          const localCount = participants.filter(
            (p) =>
              (p.storeCode?.toLowerCase() === (s.code || "").toLowerCase() ||
                p.storeCode === s.id) &&
              p.prizeId === prize.id
          ).length;
          if (localCount > 0) {
            countsByPrize[prize.id] = (countsByPrize[prize.id] || 0) + localCount;
          }
        });
      }
    });

    // Map prizes with their metadata
    let totalWon = 0;
    const breakdown = prizes
      .filter((p) => !p.isLosing)
      .map((prize, idx) => {
        const count = countsByPrize[prize.id] || 0;
        totalWon += count;
        return {
          id: prize.id,
          label: (prize.label || "Prize").trim(),
          count,
          color: getPrizeColor(prize, idx),
          rawPrize: prize,
        };
      })
      .sort((a, b) => b.count - a.count);

    // Calculate percentages
    const breakdownWithPct = breakdown.map((item) => ({
      ...item,
      percentage: totalWon > 0 ? (item.count / totalWon) * 100 : 0,
    }));

    const topPrize = breakdownWithPct.length > 0 && breakdownWithPct[0].count > 0 ? breakdownWithPct[0] : null;
    const diversity = breakdownWithPct.filter((item) => item.count > 0).length;

    return {
      totalPrizesWon: totalWon,
      breakdown: breakdownWithPct,
      topPrize,
      prizeDiversity: diversity,
      branchesCount: currentMatchingStores.length,
    };
  }, [currentMatchingStores, storeInventoriesMap, prizes, participants]);

  // Selected store prize total badge
  const selectedChainBadgeCount = useMemo(() => {
    const found = chainsList.find((c) => c.name === selectedChain);
    return found ? found.totalPrizesWon : analyticsData.totalPrizesWon;
  }, [chainsList, selectedChain, analyticsData.totalPrizesWon]);

  // SVG Donut Slices Math
  const donutSlices = useMemo(() => {
    const total = analyticsData.totalPrizesWon;
    if (total <= 0) return [];

    let accumulatedAngle = 0;
    const activeItems = analyticsData.breakdown.filter((item) => item.count > 0);

    return activeItems.map((item) => {
      const fraction = item.count / total;
      const angle = fraction * 2 * Math.PI;
      const startAngle = accumulatedAngle;
      const endAngle = accumulatedAngle + angle;
      accumulatedAngle = endAngle;

      return {
        ...item,
        fraction,
        startAngle,
        endAngle,
      };
    });
  }, [analyticsData]);

  // Handlers
  async function handleRefresh() {
    if (!onRefreshData || isRefreshing) return;
    try {
      setIsRefreshing(true);
      await onRefreshData();
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleExportStoreCsv() {
    if (onNavigateToExport) {
      const storeCode = selectedBranchId !== "all" ? selectedBranchId : currentMatchingStores[0]?.code;
      onNavigateToExport(storeCode);
      return;
    }

    // Direct local CSV download for current selection
    const headers = [
      "Participant Name",
      "Phone",
      "Store Code",
      "Store Name",
      "Prize Won",
      "Date",
    ];

    const storeCodesSet = new Set(
      currentMatchingStores.map((s) => (s.code || s.id || "").toLowerCase())
    );

    const storeParticipants = participants.filter((p) =>
      storeCodesSet.has((p.storeCode || "").toLowerCase())
    );

    const rows = storeParticipants.map((p) => [
      `"${(p.name || "").replace(/"/g, '""')}"`,
      `"${p.phone || ""}"`,
      `"${p.storeCode || ""}"`,
      `"${(p.storeName || "").replace(/"/g, '""')}"`,
      `"${(p.prizeLabel || "").replace(/"/g, '""')}"`,
      `"${p.createdAt ? new Date(p.createdAt).toISOString() : ""}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedChain.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_winners_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Active hover item data
  const hoveredItem = useMemo(() => {
    if (!hoveredPrizeId) return null;
    return analyticsData.breakdown.find((b) => b.id === hoveredPrizeId) || null;
  }, [hoveredPrizeId, analyticsData.breakdown]);

  return (
    <div className="space-y-6">
      {/* ── Top Header Banner ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/5 to-teal-500/10 border border-white/10 shadow-lg">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white shadow-md shadow-amber-500/30">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2
                className="text-xl font-black text-white tracking-tight"
                style={{ fontFamily: "Rubik, sans-serif" }}
              >
                {campaign.name || "Golden Morn"}
              </h2>
              <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 tracking-wider">
                Prize Analytics
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Live store breakdown &amp; prize distributions
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setSubTab("store_analysis")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === "store_analysis"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/30"
                  : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              Store Analysis
            </button>

            <button
              type="button"
              onClick={() => setSubTab("all_stores")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === "all_stores"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/30"
                  : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              All Stores ({chainsList.length || stores.length})
            </button>

            <button
              type="button"
              onClick={() => setSubTab("winners_directory")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === "winners_directory"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/30"
                  : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Winners Directory
            </button>
          </div>

          {onRefreshData && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh Analytics Data"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-amber-400" : ""}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportStoreCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 transition-all cursor-pointer shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Store Data</span>
          </button>
        </div>
      </div>

      {/* ── Sub-tab 1: Store Analysis ── */}
      {subTab === "store_analysis" && (
        <div className="space-y-6">
          {/* Store & Branch Selector Bar */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Store Chain Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white/50 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-amber-400" />
                  Select Store:
                </span>
                <div className="relative">
                  <select
                    value={selectedChain}
                    onChange={(e) => {
                      setSelectedChain(e.target.value);
                      setSelectedBranchId("all");
                    }}
                    className="appearance-none bg-neutral-900 border border-white/15 text-white font-bold text-xs rounded-xl pl-3 pr-8 py-2 outline-none focus:border-amber-400 cursor-pointer shadow-sm min-w-[180px]"
                  >
                    <option value="all">All Stores (Aggregate)</option>
                    {chainsList.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.branchCount} branches)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-white/40 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Prize Count Badge */}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {selectedChainBadgeCount.toLocaleString()} prizes
                </span>
              </div>

              {/* Branch Selector */}
              {availableBranches.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white/50">Branch:</span>
                  <div className="relative">
                    <select
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      className="appearance-none bg-neutral-900 border border-white/15 text-white font-bold text-xs rounded-xl pl-3 pr-8 py-2 outline-none focus:border-amber-400 cursor-pointer shadow-sm max-w-[220px] truncate"
                    >
                      <option value="all">
                        All Branches ({availableBranches.length})
                      </option>
                      {availableBranches.map((b) => (
                        <option key={b.id || b.code} value={b.id || b.code}>
                          {b.city ? `${b.city} (${b.state || "Branch"})` : b.name || b.code}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-white/40 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              )}
            </div>

            {/* Quick Metrics Pills */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-white/60">
                <span className="text-white/40">Unique Prizes:</span>
                <span className="font-bold text-white">
                  {analyticsData.prizeDiversity} types
                </span>
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-1.5 text-white/60">
                <span className="text-white/40">Total Winners:</span>
                <span className="font-bold text-amber-300">
                  {analyticsData.totalPrizesWon.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* ── 4 KPI Metric Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Prizes Won */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-amber-500/30 transition-all shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
                  Total Prizes Won
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
                  <Trophy className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                {analyticsData.totalPrizesWon.toLocaleString()}
              </div>
              <p className="text-xs text-white/40 mt-1">
                in {selectedChain === "all" ? "All Stores" : selectedChain}
                {selectedBranchId !== "all" ? " (Branch)" : ""}
              </p>
            </div>

            {/* Card 2: Top Prize Won */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-blue-500/30 transition-all shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
                  Top Prize Won
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400">
                  <Medal className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl font-black text-white truncate" style={{ fontFamily: "Rubik, sans-serif" }}>
                {analyticsData.topPrize?.label || "None Yet"}
              </div>
              <p className="text-xs text-blue-400 mt-1 font-semibold">
                {analyticsData.topPrize
                  ? `${analyticsData.topPrize.count.toLocaleString()} won (${analyticsData.topPrize.percentage.toFixed(1)}%)`
                  : "0 claims"}
              </p>
            </div>

            {/* Card 3: Prize Diversity */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-teal-500/30 transition-all shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
                  Prize Diversity
                </span>
                <div className="w-8 h-8 rounded-lg bg-teal-500/15 flex items-center justify-center text-teal-400">
                  <Gift className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                {analyticsData.prizeDiversity}
              </div>
              <p className="text-xs text-teal-300/70 mt-1">
                different prize items
              </p>
            </div>

            {/* Card 4: Store Branches */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-purple-500/30 transition-all shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
                  Store Branches
                </span>
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-400">
                  <MapPin className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                {analyticsData.branchesCount}
              </div>
              <p className="text-xs text-purple-300/70 mt-1">
                {selectedBranchId !== "all" ? "Selected branch location" : "All store locations"}
              </p>
            </div>
          </div>

          {/* ── Main Analytics Cards: Pie Chart & Ranked Breakdown ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card Left: Prize Distribution Pie / Donut Chart */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3
                      className="font-black text-white text-base tracking-tight"
                      style={{ fontFamily: "Rubik, sans-serif" }}
                    >
                      Prize Distribution Pie Chart
                    </h3>
                    <p className="text-xs text-white/40 mt-0.5">
                      Breakdown for {selectedChain === "all" ? "All Stores" : selectedChain}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-white/40">
                    Total: {analyticsData.totalPrizesWon.toLocaleString()}
                  </span>
                </div>

                {/* SVG Donut Visual */}
                <div className="relative flex items-center justify-center my-6 min-h-[260px]">
                  {donutSlices.length === 0 ? (
                    <div className="text-center py-12 text-white/30 text-xs">
                      No prize claims recorded for this store yet.
                    </div>
                  ) : (
                    <div className="relative">
                      <svg
                        width="240"
                        height="240"
                        viewBox="0 0 240 240"
                        className="transform -rotate-90 overflow-visible"
                      >
                        {donutSlices.map((slice) => {
                          const cx = 120;
                          const cy = 120;
                          const R = 100; // outer radius
                          const r = 62; // inner radius
                          const isHovered = hoveredPrizeId === slice.id;

                          // Compute outer and inner arc endpoints
                          const x1 = cx + R * Math.cos(slice.startAngle);
                          const y1 = cy + R * Math.sin(slice.startAngle);
                          const x2 = cx + R * Math.cos(slice.endAngle);
                          const y2 = cy + R * Math.sin(slice.endAngle);

                          const x3 = cx + r * Math.cos(slice.endAngle);
                          const y3 = cy + r * Math.sin(slice.endAngle);
                          const x4 = cx + r * Math.cos(slice.startAngle);
                          const y4 = cy + r * Math.sin(slice.startAngle);

                          const largeArc = slice.fraction > 0.5 ? 1 : 0;

                          // For single item representing 100% of pie
                          if (donutSlices.length === 1) {
                            return (
                              <circle
                                key={slice.id}
                                cx={cx}
                                cy={cy}
                                r={(R + r) / 2}
                                fill="none"
                                stroke={slice.color}
                                strokeWidth={R - r}
                                onMouseEnter={() => setHoveredPrizeId(slice.id)}
                                onMouseLeave={() => setHoveredPrizeId(null)}
                                className="cursor-pointer transition-all duration-300"
                              />
                            );
                          }

                          const pathData = `
                            M ${x1} ${y1}
                            A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}
                            L ${x3} ${y3}
                            A ${r} ${r} 0 ${largeArc} 0 ${x4} ${y4}
                            Z
                          `;

                          return (
                            <path
                              key={slice.id}
                              d={pathData}
                              fill={slice.color}
                              stroke="#0a0a0c"
                              strokeWidth={2}
                              onMouseEnter={() => setHoveredPrizeId(slice.id)}
                              onMouseLeave={() => setHoveredPrizeId(null)}
                              className="transition-all duration-300 cursor-pointer"
                              style={{
                                opacity: hoveredPrizeId ? (isHovered ? 1 : 0.45) : 0.95,
                                transform: isHovered ? "scale(1.04)" : "scale(1)",
                                transformOrigin: "120px 120px",
                                filter: isHovered ? `drop-shadow(0 0 8px ${slice.color}90)` : "none",
                              }}
                            />
                          );
                        })}
                      </svg>

                      {/* Center Donut Label */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                        {hoveredItem ? (
                          <div className="px-2 animate-fadeIn">
                            <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block truncate max-w-[110px]">
                              {hoveredItem.label}
                            </span>
                            <span className="text-xl font-black text-white block">
                              {hoveredItem.count.toLocaleString()}
                            </span>
                            <span className="text-[11px] font-bold text-amber-400 block">
                              {hoveredItem.percentage.toFixed(1)}%
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest block">
                              TOTAL PRIZES
                            </span>
                            <span className="text-2xl font-black text-white block" style={{ fontFamily: "Rubik, sans-serif" }}>
                              {analyticsData.totalPrizesWon.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-white/50 font-medium block">
                              {analyticsData.prizeDiversity} prize categories
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Subtext info */}
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/40 mb-4">
                  <Info className="w-3.5 h-3.5 text-amber-400/80" />
                  <span>Hover on any pie slice to inspect specific prize amounts</span>
                </div>
              </div>

              {/* Legend Grid Below Chart */}
              <div className="pt-4 border-t border-white/5">
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
                  {analyticsData.breakdown.map((item) => (
                    <div
                      key={item.id}
                      onMouseEnter={() => setHoveredPrizeId(item.id)}
                      onMouseLeave={() => setHoveredPrizeId(null)}
                      className={`flex items-center gap-1.5 cursor-pointer transition-all ${
                        hoveredPrizeId === item.id
                          ? "opacity-100 scale-105"
                          : hoveredPrizeId
                          ? "opacity-40"
                          : "opacity-80 hover:opacity-100"
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: item.color }}
                      />
                      <span className="text-white font-medium truncate max-w-[120px]">
                        {item.label}
                      </span>
                      <span className="text-white/40 font-mono text-[11px]">
                        ({item.count})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Card Right: Prize Breakdown & Amounts Won */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between shadow-sm">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3
                      className="font-black text-white text-base tracking-tight"
                      style={{ fontFamily: "Rubik, sans-serif" }}
                    >
                      Prize Breakdown &amp; Amounts Won
                    </h3>
                    <p className="text-xs text-white/40 mt-0.5">
                      Exact counts &amp; proportion of each prize in {selectedChain === "all" ? "All Stores" : selectedChain}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                    Total: {analyticsData.totalPrizesWon.toLocaleString()}
                  </span>
                </div>

                {/* Ranked Horizontal Bars */}
                <div className="space-y-3.5 pt-2">
                  {analyticsData.breakdown.map((item, index) => {
                    const isTopWinner = index === 0 && item.count > 0;
                    const isHovered = hoveredPrizeId === item.id;

                    return (
                      <div
                        key={item.id}
                        onMouseEnter={() => setHoveredPrizeId(item.id)}
                        onMouseLeave={() => setHoveredPrizeId(null)}
                        className={`space-y-1.5 transition-all p-2 rounded-xl ${
                          isHovered ? "bg-white/[0.05]" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          {/* Left: Dot + Prize Name + Top Winner Badge */}
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: item.color }}
                            />
                            <span className="font-bold text-white truncate">
                              {item.label}
                            </span>
                            {isTopWinner && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                <Sparkles className="w-2.5 h-2.5" />
                                Top Winner
                              </span>
                            )}
                          </div>

                          {/* Right: Won Count + Percentage */}
                          <div className="flex items-center gap-3 font-mono flex-shrink-0">
                            <span className="font-bold text-white">
                              {item.count.toLocaleString()} won
                            </span>
                            <span className="text-white/40 text-[11px] w-12 text-right">
                              {item.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.max(item.percentage, item.count > 0 ? 2 : 0)}%`,
                              background: item.color,
                              boxShadow: `0 0 8px ${item.color}50`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {analyticsData.breakdown.length === 0 && (
                    <p className="text-center py-8 text-xs text-white/30">
                      No prizes configured for this campaign.
                    </p>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-4 mt-4 border-t border-white/5 flex items-center justify-between text-xs text-white/40">
                <span>Sorted by prize volume descending</span>
                <button
                  type="button"
                  onClick={() => setSubTab("winners_directory")}
                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors font-bold cursor-pointer"
                >
                  <span>View all store records in directory</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-tab 2: All Stores Comparison Table ── */}
      {subTab === "all_stores" && (
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3
                className="font-black text-white text-base tracking-tight"
                style={{ fontFamily: "Rubik, sans-serif" }}
              >
                All Store Chains &amp; Outlets ({chainsList.length})
              </h3>
              <p className="text-xs text-white/40 mt-0.5">
                Complete comparison of prize distributions and winner volumes across retail chains
              </p>
            </div>

            {/* Search Filter */}
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search store name, city or state..."
                value={allStoresSearch}
                onChange={(e) => setAllStoresSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-white/15 rounded-xl text-xs text-white placeholder-white/30 outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.04] text-white/50 uppercase font-bold text-[10px] tracking-wider border-b border-white/5">
                <tr>
                  <th className="py-3 px-4">Store Brand / Chain</th>
                  <th className="py-3 px-4">Branches</th>
                  <th className="py-3 px-4">Primary Locations</th>
                  <th className="py-3 px-4">Total Prizes Won</th>
                  <th className="py-3 px-4">Top Prize</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                {chainsList
                  .filter((chain) => {
                    if (!allStoresSearch.trim()) return true;
                    const q = allStoresSearch.toLowerCase();
                    const nameMatch = chain.name.toLowerCase().includes(q);
                    const locationMatch = chain.stores.some(
                      (s) =>
                        (s.city && s.city.toLowerCase().includes(q)) ||
                        (s.state && s.state.toLowerCase().includes(q))
                    );
                    return nameMatch || locationMatch;
                  })
                  .map((chain) => {
                    const cities = Array.from(
                      new Set(chain.stores.map((s) => s.city).filter(Boolean))
                    ).slice(0, 3);
                    const states = Array.from(
                      new Set(chain.stores.map((s) => s.state).filter(Boolean))
                    ).slice(0, 2);

                    return (
                      <tr
                        key={chain.name}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3.5 px-4 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <Store className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <span>{chain.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-white/70">
                          {chain.branchCount} {chain.branchCount === 1 ? "branch" : "branches"}
                        </td>
                        <td className="py-3.5 px-4 text-white/60">
                          {[cities.join(", "), states.join(", ")].filter(Boolean).join(" • ") || "National"}
                        </td>
                        <td className="py-3.5 px-4 font-bold font-mono text-amber-300">
                          {chain.totalPrizesWon.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-white/80">
                          {chain.totalPrizesWon > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px]">
                              <Trophy className="w-3 h-3 text-amber-400" />
                              Active Winner Hub
                            </span>
                          ) : (
                            <span className="text-white/30 text-[11px]">No claims yet</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedChain(chain.name);
                              setSelectedBranchId("all");
                              setSubTab("store_analysis");
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Inspect Store</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Sub-tab 3: Winners Directory ── */}
      {subTab === "winners_directory" && (
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3
                className="font-black text-white text-base tracking-tight"
                style={{ fontFamily: "Rubik, sans-serif" }}
              >
                Winners Directory &amp; Audit Log
              </h3>
              <p className="text-xs text-white/40 mt-0.5">
                Participant records filtered for {selectedChain === "all" ? "All Stores" : selectedChain}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter name, phone, ticket ID..."
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-white/15 rounded-xl text-xs text-white placeholder-white/30 outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="button"
                onClick={handleExportStoreCsv}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-all cursor-pointer shadow-md shadow-amber-500/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Records Table */}
          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.04] text-white/50 uppercase font-bold text-[10px] tracking-wider border-b border-white/5">
                <tr>
                  <th className="py-3 px-4">Participant Name</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Store Code / Branch</th>
                  <th className="py-3 px-4">Prize Won</th>
                  <th className="py-3 px-4">Ticket ID</th>
                  <th className="py-3 px-4 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {participants
                  .filter((p) => {
                    if (selectedChain !== "all") {
                      const matchChain = currentMatchingStores.some(
                        (s) =>
                          (p.storeCode && p.storeCode.toLowerCase() === (s.code || "").toLowerCase()) ||
                          p.storeCode === s.id ||
                          (p.storeName && p.storeName.toLowerCase().includes(selectedChain.toLowerCase()))
                      );
                      if (!matchChain) return false;
                    }

                    if (!directorySearch.trim()) return true;
                    const q = directorySearch.toLowerCase();
                    return (
                      (p.name && p.name.toLowerCase().includes(q)) ||
                      (p.phone && p.phone.toLowerCase().includes(q)) ||
                      (p.prizeLabel && p.prizeLabel.toLowerCase().includes(q)) ||
                      (p.voucherCode && p.voucherCode.toLowerCase().includes(q)) ||
                      (p.id && p.id.toLowerCase().includes(q))
                    );
                  })
                  .slice(0, 100)
                  .map((p, idx) => (
                    <tr key={p.id || idx} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-bold text-white">
                        {p.name || "Anonymous"}
                      </td>
                      <td className="py-3 px-4 font-mono text-white/70">
                        {p.phone || "—"}
                      </td>
                      <td className="py-3 px-4 text-white/80">
                        <span className="font-mono text-xs text-amber-300">
                          {p.storeCode || p.storeName || "Main"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-emerald-400">
                        {p.prizeLabel || (p.won ? "Prize Winner" : "No Prize")}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-white/40">
                        {p.voucherCode || p.id || "—"}
                      </td>
                      <td className="py-3 px-4 text-right text-white/40 font-mono text-[11px]">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
