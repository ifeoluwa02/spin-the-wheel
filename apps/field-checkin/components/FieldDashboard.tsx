"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { Campaign, StoreLocation, CheckInRecord } from "@/lib/types";
import { NIGERIAN_STATES } from "@/lib/types";
import { getTodayDateStr, seedDemoStores } from "@/lib/repository";
import { formatDistance } from "@/lib/geo";
import {
  ShieldCheck, MapPin, Users, Download, Search, RefreshCw,
  Clock, CheckCircle, AlertTriangle, UserCheck, ExternalLink,
  Camera, X, Eye, FileSpreadsheet, Building2, Sparkles,
} from "lucide-react";

interface FieldDashboardProps {
  campaign: Campaign;
  campaignSlug: string;
  onUpdateCampaign?: (updated: Campaign) => void;
}

export default function FieldDashboard({ campaign, campaignSlug, onUpdateCampaign }: FieldDashboardProps) {
  const [dateFilter, setDateFilter] = useState(getTodayDateStr());
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "flagged" | "absent">("all");

  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");

  // Photo modal preview
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; storeName: string; baName: string } | null>(null);

  const [stores, setStores] = useState<StoreLocation[]>(campaign.stores || []);

  useEffect(() => {
    if (campaign.stores) {
      setStores(campaign.stores);
    }
  }, [campaign.stores]);

  async function handleSeedStores() {
    if (!confirm("Seed 4 realistic Nigerian retail stores (Spar Ilupeju, Justrite Bariga, Hubmart VI, Health Trust Abuja) with pre-configured GPS geofences?")) return;
    setSeeding(true);
    try {
      const seeded = await seedDemoStores(campaignSlug);
      setStores(seeded);
      if (onUpdateCampaign) {
        onUpdateCampaign({ ...campaign, stores: seeded });
      }
      alert("Successfully seeded 4 demo stores with GPS geofence coordinates!");
    } catch (err: any) {
      alert("Failed to seed demo stores: " + err.message);
    } finally {
      setSeeding(false);
    }
  }

  // Fetch check-ins for selected date
  async function fetchCheckIns() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/checkin?campaignId=${campaignSlug}&date=${dateFilter}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setRecords(data.records || []);
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

    const rows = combinedStoreRecords.map(({ store, checkIn }) => {
      const inTime = checkIn?.checkInTime ? new Date(checkIn.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A";
      const outTime = checkIn?.checkOutTime ? new Date(checkIn.checkOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A";
      const statusText = checkIn ? (checkIn.status === "verified" ? "VERIFIED ON-SITE" : "FLAGGED (OUTSIDE GEOFENCE)") : "ABSENT / NO SHOW";

      return [
        `"${store.storeCode || (store as any).code || store.id || ""}"`,
        `"${store.name || ""}"`,
        `"${store.address || (store as any).city || ""}"`,
        `"${store.state || ""}"`,
        `"${checkIn?.baName || "N/A"}"`,
        `"${checkIn?.baPhone || "N/A"}"`,
        `"${dateFilter}"`,
        `"${inTime}"`,
        `"${outTime}"`,
        `"${checkIn?.hoursWorked ?? "0"}"`,
        `"${checkIn?.distanceMeters ?? "N/A"}"`,
        `"${statusText}"`,
        `"${checkIn?.samplesLogged ?? 0}"`,
        `"${checkIn?.photoUrl ? "YES" : "NO"}"`,
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
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-300">Samples Logged</p>
          <p className="text-2xl font-black text-teal-400 mt-1 font-mono">{totalSamples}</p>
          <span className="text-[10px] text-teal-300/60">Across all active BAs</span>
        </div>
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

      {/* ── Table / Grid View ── */}
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
                          <div className="text-white flex items-center gap-1">
                            <Clock className="w-3 h-3 text-teal-400" />
                            <span>{arrivalTime}</span>
                          </div>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>

                      {/* GPS Distance */}
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {hasRecord ? (
                          <span className={isVerified ? "text-emerald-300 font-bold" : "text-amber-400 font-bold"}>
                            {formatDistance(checkIn!.distanceMeters)}
                          </span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-3">
                        {isVerified ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            ● Verified
                          </span>
                        ) : isFlagged ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            ▲ Outside
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
