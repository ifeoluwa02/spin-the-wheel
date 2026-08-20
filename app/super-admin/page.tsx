"use client";

import { useEffect, useState } from "react";
import type { Campaign, Participant } from "@/types";
import { getAllCampaigns, getParticipants, updateCampaign, clearCampaignData } from "@/lib/campaign";
import Link from "next/link";
import {
  Shield, LogOut, BarChart3, Globe, Plus, Download,
  Tv, ExternalLink, Settings, Activity, Trophy, Users,
  Power, ChevronRight, X, Check, Layers, RefreshCw, Database
} from "lucide-react";

export default function SuperAdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("super_admin_authed") === "true") {
      setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    loadData();
  }, [authenticated]);

  async function loadData() {
    setLoading(true);
    const cList = await getAllCampaigns();
    setCampaigns(cList);
    const all: Participant[] = [];
    await Promise.all(cList.map(async c => {
      const p = await getParticipants(c.id || "");
      all.push(...p);
    }));
    setAllParticipants(all);
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleWipeAllDatabase() {
    if (!window.confirm("⚠️ DANGER: Are you sure you want to wipe ALL participant records and reset ALL campaign prize stocks in Firestore across the entire system?")) return;
    setRefreshing(true);
    try {
      const res = await clearCampaignData();
      await loadData();
      alert(`✅ System database wiped! Cleared ${res.deletedCount} participant record(s) from Firestore.`);
    } catch (err) {
      alert("❌ Failed to wipe database. Check Firestore permissions.");
    } finally {
      setRefreshing(false);
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput === "9999") {
      setAuthenticated(true);
      sessionStorage.setItem("super_admin_authed", "true");
      setPinError(false);
    } else {
      setPinError(true);
    }
  }

  function handleLogout() {
    setAuthenticated(false);
    sessionStorage.removeItem("super_admin_authed");
  }

  async function toggleCampaignActive(c: Campaign) {
    const updated = { ...c, active: !c.active };
    await updateCampaign(updated);
    setCampaigns(prev => prev.map(x => (x.id === c.id ? updated : x)));
  }

  function exportAll() {
    const headers = ["Campaign", "Name", "Phone", "Email", "Prize", "Status", "Time"];
    const rows = allParticipants.map(p => [
      `"${p.campaignId}"`, `"${p.name}"`, `"${p.phone}"`, `"${p.email || ""}"`,
      `"${p.prizeLabel}"`, p.won ? "Winner" : "Non-Winner",
      `"${new Date(p.createdAt).toLocaleString()}"`,
    ]);
    const csv = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", "global_spin_participants.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const totalSpins = allParticipants.length;
  const totalWinners = allParticipants.filter(p => p.won).length;
  const activeCampaigns = campaigns.filter(c => c.active).length;
  const globalWinRate = totalSpins ? Math.round((totalWinners / totalSpins) * 100) : 0;
  const recentWinners = allParticipants.filter(p => p.won).slice(0, 8);

  if (loading && authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d14]">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // ─── LOGIN SCREEN ───
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{
        background: "radial-gradient(ellipse at 50% 30%, rgba(245,158,11,0.15) 0%, transparent 60%), #070d14",
        fontFamily: "Nunito, sans-serif",
      }}>
        <form onSubmit={handleLogin} className="w-full max-w-md">
          <div className="rounded-3xl p-8 space-y-7" style={{
            background: "rgba(255,255,255,0.03)", backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
          }}>
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-xl" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Super Admin Portal</h2>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Master agency access — view all campaigns & global logs.</p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-center" style={{ color: "rgba(255,255,255,0.4)" }}>Master PIN</label>
              <input type="password" value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError(false); }} placeholder="• • • •" maxLength={6} required
                className="w-full rounded-xl px-5 py-4 text-center text-2xl tracking-[0.4em] text-white outline-none transition-all font-mono placeholder:opacity-20"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: pinError ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(255,255,255,0.1)",
                }} />
              {pinError && <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400 justify-center"><X className="w-3.5 h-3.5" /> Incorrect PIN.</p>}
            </div>

            <button type="submit" className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 group transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", boxShadow: "0 8px 24px rgba(245,158,11,0.35)", fontFamily: "Rubik, sans-serif" }}>
              Access Master Portal <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="text-center">
              <Link href="/" className="text-xs font-semibold hover:text-white transition-colors" style={{ color: "rgba(255,255,255,0.3)" }}>← Back to Wheel</Link>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ─── DASHBOARD ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-20" style={{ background: "#070d14", fontFamily: "Nunito, sans-serif" }}>

      {/* Header */}
      <header className="sticky top-0 z-40 px-4 sm:px-6 py-3" style={{ background: "rgba(7,13,20,0.92)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
              <Shield className="w-4.5 h-4.5 text-white w-5 h-5" />
            </div>
            <div>
              <p className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Super Admin</p>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#f59e0b" }}>Global Management</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleWipeAllDatabase} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-950/30 border border-red-500/30 hover:bg-red-900/40 transition-all">
              <Database className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Wipe DB</span>
            </button>

            <Link href="/create-campaign" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", boxShadow: "0 4px 12px rgba(245,158,11,0.3)" }}>
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Campaign</span>
            </Link>
            <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded-xl transition-colors" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button onClick={exportAll} disabled={!allParticipants.length} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}>
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export All</span>
            </button>
            <button onClick={handleLogout} className="p-2 rounded-xl transition-colors hover:text-red-400" style={{ color: "rgba(255,255,255,0.3)" }}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">


        {/* Global Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Campaigns", value: campaigns.length, color: "#f59e0b", icon: Layers },
            { label: "Active Now", value: activeCampaigns, color: "#10b981", icon: Activity },
            { label: "Total Spins", value: totalSpins, color: "#00BFA6", icon: Users },
            { label: "Winners", value: totalWinners, color: "#FF6B35", icon: Trophy },
            { label: "Win Rate", value: `${globalWinRate}%`, color: "#a78bfa", icon: BarChart3 },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="rounded-2xl p-4 flex items-center gap-3" style={{ background: `${color}0d`, border: `1px solid ${color}25` }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
                <Icon className="w-4.5 h-4.5 w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-xl font-black leading-none font-mono" style={{ color, fontFamily: "Rubik, sans-serif" }}>{loading ? "—" : value}</p>
                <p className="text-xs mt-0.5 font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Campaign Directory */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <h2 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Campaign Directory</h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{campaigns.length} brand campaign{campaigns.length !== 1 ? "s" : ""} registered.</p>
            </div>
            <Globe className="w-5 h-5" style={{ color: "#f59e0b" }} />
          </div>

          {loading ? (
            <div className="py-20 flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `rgba(245,158,11,0.2)`, borderTopColor: "#f59e0b" }} />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>Loading campaigns…</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-2xl mb-2">📭</p>
              <p className="text-sm font-bold text-white">No campaigns yet.</p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>Create your first campaign to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    {["Brand", "Slug", "Prizes", "Status", "Actions"].map(h => (
                      <th key={h} className="px-6 py-3 text-left font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.25)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c, i) => {
                    const slug = c.id || "";
                    const spins = allParticipants.filter(p => p.campaignId === slug).length;
                    return (
                      <tr key={slug || i} className="group transition-colors hover:bg-white/[0.02]" style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {c.logoUrl ? (
                              <img src={c.logoUrl} alt={c.name} className="w-9 h-9 rounded-lg object-contain" style={{ background: "rgba(255,255,255,0.06)" }} />
                            ) : (
                              <div className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm" style={{ background: `linear-gradient(135deg, ${c.gradientStart || "#FF6B35"}, ${c.gradientEnd || "#00BFA6"})`, color: "#fff" }}>
                                {c.name?.charAt(0) || "C"}
                              </div>
                            )}
                            <div>
                              <p className="font-black text-white leading-tight">{c.name}</p>
                              <p className="text-[11px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{spins} spin{spins !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono" style={{ color: "#00BFA6" }}>/{slug}</td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-full font-black text-[11px]" style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.2)" }}>
                            {c.prizes?.length || 0} prizes
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button onClick={() => toggleCampaignActive(c)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-[11px] transition-all"
                            style={c.active
                              ? { background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }
                              : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <Power className="w-3 h-3" />
                            {c.active ? "Active" : "Paused"}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/?c=${slug}`} target="_blank" className="p-2 rounded-lg transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }} title="Wheel">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                            <Link href={`/admin?c=${slug}`} className="p-2 rounded-lg transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }} title="Admin">
                              <Settings className="w-3.5 h-3.5" />
                            </Link>
                            <Link href={`/tv?c=${slug}`} target="_blank" className="p-2 rounded-lg transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }} title="TV">
                              <Tv className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Global Winner Feed */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Global Winner Feed</h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Most recent winners across all campaigns.</p>
            </div>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black animate-pulse" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> Live
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {recentWinners.length === 0 ? (
              <p className="col-span-4 text-center py-8 text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>No winners yet across any campaigns.</p>
            ) : recentWinners.map((w, i) => (
              <div key={w.id || i} className="rounded-xl p-3.5 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)" }}>
                  <Trophy className="w-4 h-4" style={{ color: "#f59e0b" }} />
                </div>
                <div className="min-w-0">
                  <p className="font-black text-white text-sm leading-tight truncate">{w.name}</p>
                  <p className="text-[11px] truncate" style={{ color: "#00BFA6" }}>{w.prizeLabel}</p>
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>{w.campaignId}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
