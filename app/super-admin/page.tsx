"use client";

import { useEffect, useState } from "react";
import type { Campaign, Participant } from "@/types";
import {
  getAllCampaigns,
  getAllGlobalParticipants,
  updateCampaign,
} from "@/lib/campaign";
import Link from "next/link";
import {
  ShieldCheck,
  Plus,
  Users,
  Trophy,
  BarChart3,
  Download,
  ExternalLink,
  LogOut,
  Search,
  CheckCircle,
  XCircle,
  Activity,
  Globe,
  Target,
  TrendingUp,
  ChevronRight,
  X,
} from "lucide-react";

export default function SuperAdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [globalParticipants, setGlobalParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const authed = sessionStorage.getItem("super_admin_authed");
      if (authed === "true") setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    async function loadMasterData() {
      setLoading(true);
      const allC = await getAllCampaigns();
      setCampaigns(allC);
      const allP = await getAllGlobalParticipants();
      setGlobalParticipants(allP);
      setLoading(false);
    }
    loadMasterData();
  }, [authenticated]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput === "9999" || pinInput === "supersecret" || pinInput === "1234") {
      setAuthenticated(true);
      if (typeof window !== "undefined") sessionStorage.setItem("super_admin_authed", "true");
      setPinError(false);
    } else {
      setPinError(true);
    }
  }

  function handleLogout() {
    setAuthenticated(false);
    if (typeof window !== "undefined") sessionStorage.removeItem("super_admin_authed");
  }

  async function toggleCampaignActive(campaign: Campaign) {
    const updated = { ...campaign, active: !campaign.active };
    await updateCampaign(updated);
    setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? updated : c)));
  }

  function handleCopy(text: string, type: string) {
    navigator.clipboard.writeText(text);
    setCopiedLink(type);
    setTimeout(() => setCopiedLink(null), 2000);
  }

  function exportGlobalCSV() {
    if (!globalParticipants.length) return;
    const headers = ["Campaign ID","Name","Phone","Email","Prize Won","Voucher Code","Status","Date & Time"];
    const rows = globalParticipants.map((p) => [
      `"${p.campaignId}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.phone}"`,
      `"${p.email || ""}"`,
      `"${p.prizeLabel}"`,
      `"${p.voucherCode || ""}"`,
      p.won ? "Winner" : "Non-Winner",
      `"${new Date(p.createdAt).toLocaleString()}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "agency_master_all_participants.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ──────────────────────────────────────────────────────────
  // AUTH SCREEN
  // ──────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 font-sans relative overflow-hidden"
        style={{ background: "radial-gradient(circle at 30% 20%, rgba(245,158,11,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(255,107,53,0.12) 0%, transparent 50%), #0D1B2A" }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-3xl opacity-20" style={{ background: "radial-gradient(circle, #f59e0b, transparent)" }} />
        </div>

        <form onSubmit={handleLogin} className="w-full max-w-md relative">
          <div
            className="rounded-3xl p-8 shadow-2xl space-y-8"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            <div className="text-center space-y-4">
              <div className="relative inline-flex">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #FF6B35)" }}
                >
                  <ShieldCheck className="w-10 h-10 text-white" />
                </div>
              </div>
              <div>
                <h1
                  className="text-2xl font-black text-white"
                  style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}
                >
                  Agency Super Admin
                </h1>
                <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Master Control Portal · PIN: 9999
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                Master PIN
              </label>
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="• • • •"
                maxLength={10}
                className="w-full rounded-xl px-5 py-4 text-center text-2xl tracking-[0.4em] text-white outline-none transition-all font-mono placeholder:text-slate-700"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: pinError ? "1.5px solid rgba(239,68,68,0.6)" : "1.5px solid rgba(255,255,255,0.1)",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)",
                }}
                autoFocus
              />
              {pinError && (
                <p className="text-red-400 text-xs text-center font-semibold flex items-center justify-center gap-1.5">
                  <X className="w-3.5 h-3.5" /> Incorrect Master PIN. Try 9999.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-4 rounded-xl font-bold text-base text-white transition-all group"
              style={{
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                boxShadow: "0 8px 24px rgba(245,158,11,0.4)",
                fontFamily: "Rubik, sans-serif",
              }}
            >
              <span className="flex items-center justify-center gap-2">
                Unlock Master Portal
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>

            <div className="flex items-center justify-center gap-4">
              <Link href="/admin" className="text-xs font-semibold hover:text-white transition-colors" style={{ color: "rgba(255,255,255,0.3)" }}>
                ← Brand Admin
              </Link>
              <span style={{ color: "rgba(255,255,255,0.1)" }}>·</span>
              <Link href="/" className="text-xs font-semibold hover:text-white transition-colors" style={{ color: "rgba(255,255,255,0.3)" }}>
                Attendee Wheel →
              </Link>
            </div>
          </div>
        </form>
      </div>
    );
  }

  const totalCampaigns = campaigns.length;
  const totalGlobalSpins = globalParticipants.length;
  const totalGlobalWinners = globalParticipants.filter((p) => p.won).length;
  const globalWinRate = totalGlobalSpins ? Math.round((totalGlobalWinners / totalGlobalSpins) * 100) : 0;
  const activeCampaigns = campaigns.filter((c) => c.active).length;

  const filteredCampaigns = campaigns.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.subTitle && c.subTitle.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen font-sans pb-20" style={{ background: "#070d14", fontFamily: "Nunito, sans-serif" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40 px-4 py-3"
        style={{
          background: "rgba(7,13,20,0.9)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #f59e0b, #FF6B35)" }}
            >
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-black text-white text-sm leading-tight" style={{ fontFamily: "Rubik, sans-serif" }}>
                Agency Master Portal
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
                Super Admin · {activeCampaigns} Active
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/create-campaign"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition-all"
              style={{ background: "linear-gradient(135deg, #00BFA6, #0D9488)", boxShadow: "0 4px 12px rgba(0,191,166,0.25)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Host Campaign</span>
            </Link>

            <button
              onClick={exportGlobalCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export All</span>
            </button>

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl transition-colors"
              style={{ color: "rgba(255,255,255,0.3)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#ef4444")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)")}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-8 space-y-6">
        {/* Hero metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Campaigns", value: totalCampaigns, color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.15)", icon: Globe },
            { label: "Active Now", value: activeCampaigns, color: "#00BFA6", bg: "rgba(0,191,166,0.08)", border: "rgba(0,191,166,0.15)", icon: Activity },
            { label: "Total Spins", value: totalGlobalSpins, color: "#60a5fa", bg: "rgba(96,165,250,0.08)", border: "rgba(96,165,250,0.15)", icon: TrendingUp },
            { label: "Winners", value: totalGlobalWinners, color: "#10b981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.15)", icon: Trophy },
            { label: "Win Rate", value: `${globalWinRate}%`, color: "#FF6B35", bg: "rgba(255,107,53,0.08)", border: "rgba(255,107,53,0.15)", icon: Target },
          ].map(({ label, value, color, bg, border, icon: Icon }) => (
            <div
              key={label}
              className="rounded-2xl p-4 flex flex-col gap-3"
              style={{ background: bg, border: `1px solid ${border}` }}
            >
              <Icon className="w-5 h-5" style={{ color }} />
              <div>
                <p className="text-2xl font-black leading-none font-mono" style={{ color, fontFamily: "Rubik, sans-serif" }}>
                  {value}
                </p>
                <p className="text-[11px] mt-1 font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Campaigns Table */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {/* Table header */}
          <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <h2 className="font-black text-white text-base" style={{ fontFamily: "Rubik, sans-serif" }}>
                Campaign Directory
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                Monitor, launch, and manage all hosted brand campaigns.
              </p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.25)" }} />
              <input
                type="text"
                placeholder="Search campaign…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none w-52"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(245,158,11,0.4)")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-20 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(245,158,11,0.2)", borderTopColor: "#f59e0b" }} />
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>Loading campaigns…</p>
                </div>
              </div>
            ) : (
              <table className="w-full text-left" style={{ fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                    {["Campaign","Sub-Brand","Segments","Spins","Status","Launch"].map((h) => (
                      <th key={h} className="px-5 py-3 font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.25)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>
                        No campaigns found.
                      </td>
                    </tr>
                  ) : (
                    filteredCampaigns.map((c) => {
                      const campaignSpins = globalParticipants.filter((p) => p.campaignId === c.id).length;
                      const campaignWinners = globalParticipants.filter((p) => p.campaignId === c.id && p.won).length;

                      return (
                        <tr
                          key={c.id}
                          className="group transition-all"
                          style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              {c.logoUrl ? (
                                <img src={c.logoUrl} alt={c.name} className="w-9 h-9 rounded-xl object-contain p-1" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                              ) : (
                                <div
                                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
                                  style={{ background: `${c.primaryColor || "#00BFA6"}25`, border: `1px solid ${c.primaryColor || "#00BFA6"}30` }}
                                >
                                  🎯
                                </div>
                              )}
                              <div>
                                <p className="font-black text-white leading-tight text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>
                                  {c.name}
                                </p>
                                <p className="font-mono text-[10px] mt-0.5" style={{ color: "#00BFA6" }}>
                                  /{c.id}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-4 font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>
                            {c.subTitle || "—"}
                          </td>

                          <td className="px-5 py-4 font-mono font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>
                            {c.prizes.length}
                          </td>

                          <td className="px-5 py-4">
                            <div>
                              <span className="font-black font-mono" style={{ color: "#f59e0b" }}>{campaignSpins}</span>
                              <span className="text-[10px] ml-1" style={{ color: "rgba(255,255,255,0.3)" }}>· {campaignWinners}W</span>
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <button
                              onClick={() => toggleCampaignActive(c)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-all"
                              style={{
                                background: c.active ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                                color: c.active ? "#10b981" : "#f87171",
                                border: `1px solid ${c.active ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                              }}
                            >
                              {c.active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {c.active ? "Active" : "Paused"}
                            </button>
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/?c=${c.id}`}
                                target="_blank"
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all"
                                style={{ background: "rgba(0,191,166,0.1)", color: "#00BFA6", border: "1px solid rgba(0,191,166,0.15)" }}
                              >
                                Wheel <ExternalLink className="w-2.5 h-2.5" />
                              </Link>
                              <Link
                                href={`/admin?c=${c.id}`}
                                target="_blank"
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all"
                                style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.15)" }}
                              >
                                Admin <ExternalLink className="w-2.5 h-2.5" />
                              </Link>
                              <Link
                                href={`/tv?c=${c.id}`}
                                target="_blank"
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all"
                                style={{ background: "rgba(255,107,53,0.1)", color: "#FF6B35", border: "1px solid rgba(255,107,53,0.15)" }}
                              >
                                TV <ExternalLink className="w-2.5 h-2.5" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Global recent activity */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <h3 className="font-black text-white text-base" style={{ fontFamily: "Rubik, sans-serif" }}>
            Global Activation Feed
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
            {globalParticipants.filter((p) => p.won).slice(0, 9).map((p, i) => (
              <div
                key={p.id || i}
                className="rounded-xl p-3.5 flex items-center gap-3"
                style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.1)" }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
                  style={{ background: "rgba(16,185,129,0.15)" }}
                >
                  🏆
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{p.name}</p>
                  <p className="text-[11px] truncate" style={{ color: "#10b981" }}>{p.prizeLabel}</p>
                  <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>{p.campaignId}</p>
                </div>
              </div>
            ))}
            {globalParticipants.filter((p) => p.won).length === 0 && (
              <div className="col-span-3 py-8 text-center text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>
                No winners recorded yet across all campaigns.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
