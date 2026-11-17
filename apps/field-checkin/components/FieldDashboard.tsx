"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { Campaign, StoreLocation, CheckInRecord, SurveyRecord } from "@/lib/types";
import { NIGERIAN_STATES } from "@/lib/types";
import { formatDistance } from "@/lib/geo";
import {
  ShieldCheck, MapPin, Users, Download, Search, RefreshCw,
  Clock, CheckCircle, AlertTriangle, UserCheck, ExternalLink,
  Camera, X, Eye, FileSpreadsheet, Building2, Sparkles, ClipboardList,
} from "lucide-react";

function getLagosTodayStr(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

interface FieldDashboardProps {
  campaign: Campaign;
  campaignSlug: string;
  authToken?: string;
  onUpdateCampaign?: (updated: Campaign) => void;
}

export default function FieldDashboard({
  campaign,
  campaignSlug,
  authToken,
  onUpdateCampaign,
}: FieldDashboardProps) {
  const [dateFilter, setDateFilter] = useState(getLagosTodayStr());
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "flagged" | "absent">("all");
  const [dashboardTab, setDashboardTab] = useState<"attendance" | "surveys">("attendance");

  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [surveys, setSurveys] = useState<SurveyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [reviewingId, setReviewingId] = useState<string>("");
  const [error, setError] = useState("");

  // Photo modal preview
  const [viewingPhoto, setViewingPhoto] = useState<{
    url: string;
    storeName: string;
    baName: string;
    sha256?: string;
  } | null>(null);

  const [stores, setStores] = useState<StoreLocation[]>(campaign.stores || []);

  useEffect(() => {
    if (campaign.stores) {
      setStores(campaign.stores);
    }
  }, [campaign.stores]);

  function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    return headers;
  }

  async function handleSeedStores() {
    if (!confirm("Seed realistic Nigerian retail stores with pre-configured GPS geofences?")) return;
    setSeeding(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: "seed_demo_stores",
          campaignId: campaignSlug,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert("Failed to seed demo stores: " + (data.error || "Unauthorized"));
        return;
      }
      const seeded: StoreLocation[] = data.stores || [];
      setStores(seeded);
      if (onUpdateCampaign) {
        onUpdateCampaign({ ...campaign, stores: seeded });
      }
      alert("Successfully seeded demo stores with GPS geofence coordinates!");
    } catch (err: any) {
      alert("Failed to seed demo stores: " + err.message);
    } finally {
      setSeeding(false);
    }
  }

  async function handleReviewCheckIn(checkInId: string, decision: "approved" | "rejected") {
    const note =
      decision === "rejected"
        ? prompt("Optional reason for rejecting this check-in:", "Outside store perimeter") || undefined
        : "Approved by supervisor";
    setReviewingId(checkInId);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: "review_checkin",
          campaignId: campaignSlug,
          checkInId,
          decision,
          reviewNote: note,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.checkIn) {
        setRecords((prev) =>
          prev.map((r) => (r.id === checkInId ? data.checkIn : r))
        );
      } else {
        alert(data.error || "Could not update review status.");
      }
    } catch {
      alert("Network error while reviewing check-in.");
    } finally {
      setReviewingId("");
    }
  }

  // Fetch check-ins for selected date
  async function fetchCheckIns() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/checkin?campaignId=${encodeURIComponent(campaignSlug)}&date=${encodeURIComponent(dateFilter)}`,
        { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setRecords(data.records || []);
        setSurveys(data.surveys || []);
      } else {
        setError(data.error || "Failed to load check-ins.");
      }
    } catch (err: any) {
      console.error("Fetch checkins error:", err);
      setError("Network error. Could not load records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCheckIns();
  }, [campaignSlug, dateFilter]);

  // Map stores against their check-in records for the day
  const combinedStoreRecords = useMemo(() => {
    const recordMap = new Map<string, CheckInRecord>();
    for (const r of records) {
      const codeKey = (r.storeCode || "").trim().toLowerCase();
      if (!recordMap.has(codeKey)) {
        recordMap.set(codeKey, r);
      }
    }

    return stores.map((s) => {
      const sCode = (s.storeCode || (s as any).code || s.id || "").trim().toLowerCase();
      const rec = recordMap.get(sCode) || null;
      return {
        store: s,
        checkIn: rec,
      };
    });
  }, [stores, records]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return combinedStoreRecords.filter(({ store, checkIn }) => {
      const q = searchQuery.toLowerCase().trim();
      const sCode = (store.storeCode || (store as any).code || store.id || "").toLowerCase();
      const sAddr = (store.address || (store as any).city || "").toLowerCase();
      const matchesSearch =
        !q ||
        store.name.toLowerCase().includes(q) ||
        sCode.includes(q) ||
        sAddr.includes(q) ||
        (checkIn?.baName && checkIn.baName.toLowerCase().includes(q)) ||
        (checkIn?.baPhone && checkIn.baPhone.includes(q));

      const matchesState =
        stateFilter === "all" ||
        (store.state && store.state.toLowerCase() === stateFilter.toLowerCase());

      const status = checkIn ? checkIn.status : "absent";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "absent" && !checkIn) ||
        (statusFilter === "verified" && checkIn?.status === "verified") ||
        (statusFilter === "flagged" && checkIn?.status === "flagged");

      return matchesSearch && matchesState && matchesStatus;
    });
  }, [combinedStoreRecords, searchQuery, stateFilter, statusFilter]);

  // Metrics
  const totalStores = stores.length;
  const verifiedCount = combinedStoreRecords.filter((r) => r.checkIn?.status === "verified").length;
  const flaggedCount = combinedStoreRecords.filter((r) => r.checkIn?.status === "flagged").length;
  const absentCount = totalStores - (verifiedCount + flaggedCount);
  const totalSamples = records.reduce((acc, r) => acc + (r.samplesLogged || 0), 0);

  // ── CSV Export for Client Invoicing ──
  function handleExportCSV() {
    if (!combinedStoreRecords.length) return;

    const headers = [
      "Store Code",
      "Store Name",
      "City",
      "State",
      "BA Name",
      "BA Phone",
      "Date",
      "Check-In Time",
      "Check-Out Time",
      "Hours Worked",
      "GPS Distance (Meters)",
      "Geofence Status",
      "Samples Logged",
      "Has Photo Proof",
    ];

    const escapeCsvCell = (val: unknown): string => {
      let str = String(val ?? "");
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = combinedStoreRecords.map(({ store, checkIn }) => {
      const inTime = checkIn?.checkInTime ? new Date(checkIn.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A";
      const outTime = checkIn?.checkOutTime ? new Date(checkIn.checkOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A";
      const statusText = checkIn ? (checkIn.status === "verified" ? "VERIFIED ON-SITE" : "FLAGGED (OUTSIDE GEOFENCE)") : "ABSENT / NO SHOW";

      return [
        escapeCsvCell(store.storeCode || (store as any).code || store.id || ""),
        escapeCsvCell(store.name || ""),
        escapeCsvCell(store.address || (store as any).city || ""),
        escapeCsvCell(store.state || ""),
        escapeCsvCell(checkIn?.baName || "N/A"),
        escapeCsvCell(checkIn?.baPhone || "N/A"),
        escapeCsvCell(dateFilter),
        escapeCsvCell(inTime),
        escapeCsvCell(outTime),
        escapeCsvCell(checkIn?.hoursWorked ?? "0"),
        escapeCsvCell(checkIn?.distanceMeters ?? "N/A"),
        escapeCsvCell(statusText),
        escapeCsvCell(checkIn?.samplesLogged ?? 0),
        escapeCsvCell(checkIn?.photoUrl ? "YES" : "NO"),
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Field_Timesheet_${campaignSlug}_${dateFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ── CSV Export for Consumer Surveys ──
  function handleExportSurveysCSV() {
    if (!surveys.length) return;

    const escapeCsvCell = (val: unknown): string => {
      let str = String(val ?? "");
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = [
      "Timestamp",
      "Date",
      "Store Code",
      "Store Name",
      "BA Name",
      "Survey Mode",
      "Respondent Name",
      "Respondent Phone",
      "Product / Stage",
      "Feedback / Diaper Size",
      "Purchased / Current Brand",
      "Notes",
    ];

    const rows = surveys.map((s) => {
      const timeStr = s.createdAt
        ? new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "N/A";
      const colProductOrStage =
        s.surveyType === "hospital"
          ? s.motherStage === "expectant"
            ? `Expectant (${s.dueOrBirthDate || "N/A"})`
            : `Nursing (${s.dueOrBirthDate || "N/A"})`
          : s.productSampled || "N/A";
      const colFeedbackOrSize =
        s.surveyType === "hospital" ? s.diaperSizeIssued || "N/A" : s.tasteFeedback || "N/A";
      const colPurchaseOrBrand =
        s.surveyType === "hospital"
          ? s.currentBrandUsed || "N/A"
          : s.purchasedOnShelf
          ? `YES (${s.packsPurchased || 1} packs)`
          : "NO";

      return [
        escapeCsvCell(timeStr),
        escapeCsvCell(s.shiftDate || dateFilter),
        escapeCsvCell(s.storeCode),
        escapeCsvCell(s.storeName),
        escapeCsvCell(s.baName),
        escapeCsvCell(s.surveyType.toUpperCase()),
        escapeCsvCell(s.respondentName),
        escapeCsvCell(s.respondentPhone || "N/A"),
        escapeCsvCell(colProductOrStage),
        escapeCsvCell(colFeedbackOrSize),
        escapeCsvCell(colPurchaseOrBrand),
        escapeCsvCell(s.notes || ""),
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Field_Surveys_${campaignSlug}_${dateFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const filteredSurveys = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return surveys.filter((s) => {
      if (!q) return true;
      return (
        s.respondentName.toLowerCase().includes(q) ||
        (s.respondentPhone && s.respondentPhone.includes(q)) ||
        s.storeName.toLowerCase().includes(q) ||
        s.storeCode.toLowerCase().includes(q) ||
        s.baName.toLowerCase().includes(q)
      );
    });
  }, [surveys, searchQuery]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Top Metric Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Total Stores</p>
          <p className="text-2xl font-black text-white mt-1 font-mono">{totalStores}</p>
          <span className="text-[10px] text-white/50">Scheduled for activation</span>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Verified On-Site</p>
          <p className="text-2xl font-black text-emerald-400 mt-1 font-mono">{verifiedCount}</p>
          <span className="text-[10px] text-emerald-300/60">
            {totalStores > 0 ? `${Math.round((verifiedCount / totalStores) * 100)}% compliance` : "0%"}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Outside Geofence</p>
          <p className="text-2xl font-black text-amber-400 mt-1 font-mono">{flaggedCount}</p>
          <span className="text-[10px] text-amber-300/60">Flagged for review</span>
        </div>

        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25">
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-300">No Show / Absent</p>
          <p className="text-2xl font-black text-red-400 mt-1 font-mono">{absentCount}</p>
          <span className="text-[10px] text-red-300/60">Pending check-in</span>
        </div>

        <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/25 col-span-2 sm:col-span-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-300">Surveys & Samples</p>
          <p className="text-2xl font-black text-teal-400 mt-1 font-mono">
            {surveys.length} <span className="text-sm text-white/50 font-normal">/ {totalSamples}</span>
          </p>
          <span className="text-[10px] text-teal-300/60">Surveys vs Total Samples</span>
        </div>
      </div>

      {/* ── Separate Architecture View Switcher: Attendance vs Consumer Surveys ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-900/80 p-1.5 rounded-2xl border border-white/10">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDashboardTab("attendance")}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              dashboardTab === "attendance"
                ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Attendance & Geofence ({verifiedCount}/{totalStores})</span>
          </button>

          <button
            type="button"
            onClick={() => setDashboardTab("surveys")}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              dashboardTab === "surveys"
                ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Consumer Surveys ({surveys.length})</span>
          </button>
        </div>

        {dashboardTab === "surveys" && (
          <button
            type="button"
            disabled={!surveys.length}
            onClick={handleExportSurveysCSV}
            className="px-3.5 py-2 rounded-xl text-xs font-black text-black bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Surveys (CSV)</span>
          </button>
        )}
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[260px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Search store name, code, BA name, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs text-white bg-white/5 border border-white/10 focus:border-teal-400 focus:outline-none"
              />
            </div>

            {/* State Filter */}
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs text-white bg-slate-900 border border-white/10 focus:border-teal-400 focus:outline-none cursor-pointer"
            >
              <option value="all">All States</option>
              {NIGERIAN_STATES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>

            {/* Date Picker */}
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs font-mono text-white bg-slate-900 border border-white/10 focus:border-teal-400 focus:outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={fetchCheckIns}
              className="px-3 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Refresh check-in records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              disabled={loading || seeding}
              onClick={handleSeedStores}
              className="px-3.5 py-2 rounded-xl text-xs font-black text-slate-900 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
              title="Seed 4 demo Nigerian stores with GPS geofence coordinates"
            >
              <Sparkles className={`w-3.5 h-3.5 ${seeding ? "animate-spin" : ""}`} />
              <span>{seeding ? "Seeding..." : "Seed Demo Stores"}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl text-xs font-black text-black bg-teal-400 hover:bg-teal-300 flex items-center gap-1.5 transition-all shadow-md shadow-teal-500/20 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Timesheet (CSV)</span>
            </button>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              statusFilter === "all" ? "bg-white/20 text-white" : "text-white/40 hover:text-white"
            }`}
          >
            All Stores ({totalStores})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("verified")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              statusFilter === "verified" ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/40" : "text-white/40 hover:text-emerald-300"
            }`}
          >
            ● Verified ({verifiedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("flagged")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              statusFilter === "flagged" ? "bg-amber-500/25 text-amber-300 border border-amber-500/40" : "text-white/40 hover:text-amber-300"
            }`}
          >
            ▲ Outside Geofence ({flaggedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("absent")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              statusFilter === "absent" ? "bg-red-500/25 text-red-300 border border-red-500/40" : "text-white/40 hover:text-red-300"
            }`}
          >
            ○ Absent ({absentCount})
          </button>
        </div>
      </div>

      {/* ── Table / Grid View (Attendance OR Dedicated Surveys) ── */}
      {dashboardTab === "surveys" ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-xs text-white/40 flex flex-col items-center justify-center gap-2 font-mono">
              <span className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              <span>Loading consumer surveys for {dateFilter}...</span>
            </div>
          ) : filteredSurveys.length === 0 ? (
            <div className="py-14 text-center text-xs text-white/40">
              No consumer surveys submitted for {dateFilter} yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03] text-white/50 text-[10px] uppercase font-mono tracking-wider">
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-3">Store Location</th>
                    <th className="py-3 px-3">BA Name</th>
                    <th className="py-3 px-3">Respondent</th>
                    <th className="py-3 px-3">Mode</th>
                    <th className="py-3 px-3">Product / Stage</th>
                    <th className="py-3 px-3">Feedback / Kit</th>
                    <th className="py-3 px-4">Conversion / Brand</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredSurveys.map((s) => (
                    <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-white/70">
                        {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">{s.storeName}</div>
                        <div className="font-mono text-[10px] text-teal-400">{s.storeCode}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-white/90">{s.baName}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">{s.respondentName}</div>
                        {s.respondentPhone && (
                          <div className="font-mono text-[10px] text-white/50">{s.respondentPhone}</div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-teal-500/15 text-teal-300 border border-teal-500/30">
                          {s.surveyType}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-white/80">
                        {s.surveyType === "hospital"
                          ? `${s.motherStage === "expectant" ? "🤰 Expectant" : "👶 Nursing"}${s.dueOrBirthDate ? ` (${s.dueOrBirthDate})` : ""}`
                          : s.productSampled || "—"}
                      </td>
                      <td className="py-3 px-3 text-white/80">
                        {s.surveyType === "hospital"
                          ? s.diaperSizeIssued || "—"
                          : s.tasteFeedback?.replace("_", " ") || "—"}
                      </td>
                      <td className="py-3 px-4">
                        {s.surveyType === "hospital" ? (
                          <span className="text-amber-300 font-semibold">
                            Uses: {s.currentBrandUsed || "N/A"}
                          </span>
                        ) : s.purchasedOnShelf ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            🛒 Bought ({s.packsPurchased || 1})
                          </span>
                        ) : (
                          <span className="text-white/40">Sampled only</span>
                        )}
                        {s.notes && (
                          <div className="text-[10px] text-white/40 italic mt-0.5">"{s.notes}"</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-xs text-white/40 flex flex-col items-center justify-center gap-2 font-mono">
            <span className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
            <span>Loading field attendance records for {dateFilter}...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-14 text-center text-xs text-white/40">
            No store attendance records match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-white/50 text-[10px] uppercase font-mono tracking-wider">
                  <th className="py-3 px-4">Store Location</th>
                  <th className="py-3 px-3">State / City</th>
                  <th className="py-3 px-3">BA Staff</th>
                  <th className="py-3 px-3">Arrival Time</th>
                  <th className="py-3 px-3">GPS Distance</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-center">Samples</th>
                  <th className="py-3 px-4 text-center">Proof</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRows.map(({ store, checkIn }) => {
                  const hasRecord = Boolean(checkIn);
                  const isVerified = checkIn?.status === "verified";
                  const isFlagged = checkIn?.status === "flagged";
                  const arrivalTime = checkIn?.checkInTime
                    ? new Date(checkIn.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : null;

                  return (
                    <tr
                      key={store.id || store.storeCode || (store as any).code}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Store Details */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{store.name}</div>
                        <div className="font-mono text-[10px] text-teal-400 mt-0.5">{store.storeCode || (store as any).code || "NO-CODE"}</div>
                      </td>

                      {/* State / Address */}
                      <td className="py-3 px-3">
                        <div className="text-white/80 text-xs line-clamp-1">{store.address || (store as any).city || "—"}</div>
                        {store.state && (
                          <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25 mt-0.5">
                            {store.state}
                          </span>
                        )}
                      </td>

                      {/* BA Details */}
                      <td className="py-3 px-3">
                        {hasRecord ? (
                          <div>
                            <div className="font-semibold text-white">{checkIn!.baName}</div>
                            {checkIn!.baPhone && (
                              <div className="font-mono text-[10px] text-white/50 mt-0.5">{checkIn!.baPhone}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-white/30 italic">Unassigned / Pending</span>
                        )}
                      </td>

                      {/* Arrival Timestamp */}
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {arrivalTime ? (
                          <div className="space-y-0.5">
                            <div className="text-white flex items-center gap-1">
                              <Clock className="w-3 h-3 text-teal-400" />
                              <span>{arrivalTime}</span>
                            </div>
                            {checkIn?.checkOutTime ? (
                              <div className="text-[10px] text-white/50">
                                Out: {new Date(checkIn.checkOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                {checkIn.hoursWorked ? ` (${checkIn.hoursWorked}h)` : ""}
                              </div>
                            ) : checkIn?.inFencePingCount ? (
                              <div className="text-[10px] text-teal-400/80">
                                {checkIn.inFencePingCount} presence ping(s)
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>

                      {/* GPS Distance */}
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {hasRecord ? (
                          <div>
                            <span className={isVerified ? "text-emerald-300 font-bold" : "text-amber-400 font-bold"}>
                              {formatDistance(checkIn!.distanceMeters)}
                            </span>
                            {typeof checkIn?.checkInAccuracy === "number" && (
                              <span className="text-[10px] text-white/40 ml-1">±{checkIn.checkInAccuracy}m</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>

                      {/* Status Badge + Supervisor Flagged Review Controls */}
                      <td className="py-3 px-3">
                        {isVerified || checkIn?.status === "checked_out" ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            ● {checkIn?.status === "checked_out" ? "Checked Out" : "Verified"}
                          </span>
                        ) : isFlagged ? (
                          <div className="space-y-1">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-block">
                              ▲ Flagged Review
                            </span>
                            {checkIn?.spoofReasons && checkIn.spoofReasons.length > 0 && (
                              <div className="text-[9px] text-amber-200/70 max-w-[160px] truncate" title={checkIn.spoofReasons.join(", ")}>
                                {checkIn.spoofReasons[0]}
                              </div>
                            )}
                            <div className="flex items-center gap-1 pt-0.5">
                              <button
                                type="button"
                                disabled={reviewingId === checkIn!.id}
                                onClick={() => handleReviewCheckIn(checkIn!.id, "approved")}
                                className="px-1.5 py-0.5 rounded bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 text-[9px] font-bold cursor-pointer"
                              >
                                ✓ Approve
                              </button>
                              <button
                                type="button"
                                disabled={reviewingId === checkIn!.id}
                                onClick={() => handleReviewCheckIn(checkIn!.id, "rejected")}
                                className="px-1.5 py-0.5 rounded bg-red-500/25 hover:bg-red-500/40 text-red-200 text-[9px] font-bold cursor-pointer"
                              >
                                ✕ Reject
                              </button>
                            </div>
                          </div>
                        ) : checkIn?.status === "rejected" ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/25 text-red-300 border border-red-500/40">
                            ✕ Rejected
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/25">
                            ○ Absent
                          </span>
                        )}
                      </td>

                      {/* Samples Count */}
                      <td className="py-3 px-3 text-center font-mono font-bold text-white">
                        {hasRecord ? (checkIn!.samplesLogged ?? 0) : "—"}
                      </td>

                      {/* Photo Proof */}
                      <td className="py-3 px-4 text-center">
                        {checkIn?.photoUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setViewingPhoto({
                                url: checkIn.photoUrl!,
                                storeName: store.name,
                                baName: checkIn.baName,
                                sha256: checkIn.photoSha256,
                              })
                            }
                            className="p-1.5 rounded-lg bg-teal-500/15 text-teal-300 hover:bg-teal-500/25 border border-teal-500/30 transition-all cursor-pointer inline-flex items-center gap-1 text-[10px]"
                            title="View Morning Selfie"
                          >
                            <Camera className="w-3 h-3" />
                            <span>Photo</span>
                          </button>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* ── Photo Preview Modal ── */}
      {viewingPhoto && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fadeIn"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(14px)" }}
          onClick={() => setViewingPhoto(null)}
        >
          <div
            className="rounded-3xl p-5 max-w-sm w-full bg-[#0b131e] border border-white/20 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div>
                <p className="font-bold text-sm text-white">{viewingPhoto.storeName}</p>
                <p className="text-xs text-white/50">{viewingPhoto.baName}</p>
                {viewingPhoto.sha256 && (
                  <p className="text-[10px] font-mono text-emerald-400 mt-0.5">
                    SHA-256: {viewingPhoto.sha256.slice(0, 16)}…
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setViewingPhoto(null)}
                className="p-1 rounded-full text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
              <img
                src={viewingPhoto.url}
                alt="Arrival Proof"
                className="w-full h-80 object-cover"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
