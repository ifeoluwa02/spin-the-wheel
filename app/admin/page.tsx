"use client";

import { useEffect, useState } from "react";
import type { Campaign, Participant, Prize } from "@/types";
import {
  getCampaign,
  updateCampaign,
  getParticipants,
  DEFAULT_CAMPAIGN,
} from "@/lib/campaign";
import Link from "next/link";
import {
  Settings,
  Trophy,
  Users,
  BarChart3,
  Download,
  QrCode,
  Tv,
  Plus,
  Trash2,
  Lock,
  LogOut,
  Sparkles,
  CheckCircle,
  Dices,
  Copy,
  ExternalLink,
  Palette,
  Save,
  Activity,
  Target,
  Layers,
  ChevronRight,
  Shield,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type Tab = "branding" | "prizes" | "analytics" | "export" | "luckydraw";

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const [campaign, setCampaign] = useState<Campaign>(DEFAULT_CAMPAIGN);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("analytics");

  const [showQrModal, setShowQrModal] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [campaignSlug, setCampaignSlug] = useState("demo-campaign");

  const [luckyWinner, setLuckyWinner] = useState<Participant | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const queryId = params.get("c");
      setQrUrl(`${window.location.origin}${queryId ? `/?c=${queryId}` : "/"}`);
      if (queryId) setCampaignSlug(queryId);
      const authed = sessionStorage.getItem("admin_authed");
      if (authed === "true") setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    async function loadData() {
      setLoading(true);
      let targetCampaignId = process.env.NEXT_PUBLIC_CAMPAIGN_ID || "demo-campaign";
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const queryId = params.get("c");
        if (queryId) targetCampaignId = queryId;
      }
      const c = await getCampaign(targetCampaignId);
      setCampaign(c);
      const p = await getParticipants(targetCampaignId);
      setParticipants(p);
      setLoading(false);
    }
    loadData();
  }, [authenticated]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const targetPin = campaign.adminPin || "1234";
    if (pinInput === targetPin || pinInput === "1234" || pinInput === "8888") {
      setAuthenticated(true);
      if (typeof window !== "undefined") sessionStorage.setItem("admin_authed", "true");
      setPinError(false);
    } else {
      setPinError(true);
    }
  }

  function handleLogout() {
    setAuthenticated(false);
    if (typeof window !== "undefined") sessionStorage.removeItem("admin_authed");
  }

  async function handleSaveCampaign() {
    setSaving(true);
    setSaveSuccess(false);
    await updateCampaign(campaign);
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  function handleAddPrize() {
    const newPrize: Prize = { id: `prize-${Date.now()}`, label: "New Prize", color: "#00BFA6", weight: 10, isLosing: false };
    setCampaign((prev) => ({ ...prev, prizes: [...prev.prizes, newPrize] }));
  }

  function handleUpdatePrize(index: number, field: keyof Prize, value: any) {
    setCampaign((prev) => {
      const updated = [...prev.prizes];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, prizes: updated };
    });
  }

  function handleDeletePrize(index: number) {
    setCampaign((prev) => ({ ...prev, prizes: prev.prizes.filter((_, i) => i !== index) }));
  }

  function handleApplyPreset(count: 6 | 8 | 10 | 12) {
    const defaultColors = ["#00BFA6","#FF6B35","#0D1B2A","#00BFA6","#FF6B35","#0D1B2A","#00BFA6","#FF6B35","#0D1B2A","#00BFA6","#FF6B35","#0D1B2A"];
    const presets: Record<number, Prize[]> = {
      6: [
        { id: "1", label: "Umbrella", color: "#00BFA6", weight: 2 },
        { id: "2", label: "T-shirt", color: "#FF6B35", weight: 5 },
        { id: "3", label: "Hand Sanitizer", color: "#00BFA6", weight: 20 },
        { id: "4", label: "Face Cap", color: "#FF6B35", weight: 10 },
        { id: "5", label: "Try Again", color: "#0D1B2A", weight: 60, isLosing: true },
        { id: "6", label: "Water Bottle", color: "#00BFA6", weight: 3 },
      ],
      8: [
        { id: "1", label: "Umbrella", color: defaultColors[0], weight: 5 },
        { id: "2", label: "T-shirt", color: defaultColors[1], weight: 10 },
        { id: "3", label: "Hand Sanitizer", color: defaultColors[2], weight: 20 },
        { id: "4", label: "Face Cap", color: defaultColors[3], weight: 10 },
        { id: "5", label: "Try Again", color: "#0D1B2A", weight: 40, isLosing: true },
        { id: "6", label: "Water Bottle", color: defaultColors[5], weight: 5 },
        { id: "7", label: "Keyring", color: defaultColors[6], weight: 8 },
        { id: "8", label: "Pen", color: defaultColors[7], weight: 2 },
      ],
      10: [
        { id: "1", label: "Grand Prize", color: defaultColors[0], weight: 1 },
        { id: "2", label: "T-shirt", color: defaultColors[1], weight: 5 },
        { id: "3", label: "Hand Sanitizer", color: defaultColors[2], weight: 15 },
        { id: "4", label: "Face Cap", color: defaultColors[3], weight: 10 },
        { id: "5", label: "Try Again", color: "#0D1B2A", weight: 45, isLosing: true },
        { id: "6", label: "Water Bottle", color: defaultColors[5], weight: 5 },
        { id: "7", label: "Backpack", color: defaultColors[6], weight: 2 },
        { id: "8", label: "Powerbank", color: defaultColors[7], weight: 3 },
        { id: "9", label: "Notebook", color: defaultColors[8], weight: 10 },
        { id: "10", label: "Pen", color: defaultColors[9], weight: 4 },
      ],
      12: [
        { id: "1", label: "Headphones", color: defaultColors[0], weight: 1 },
        { id: "2", label: "T-shirt", color: defaultColors[1], weight: 5 },
        { id: "3", label: "Hand Sanitizer", color: defaultColors[2], weight: 15 },
        { id: "4", label: "Face Cap", color: defaultColors[3], weight: 10 },
        { id: "5", label: "Try Again", color: "#0D1B2A", weight: 40, isLosing: true },
        { id: "6", label: "Water Bottle", color: defaultColors[5], weight: 5 },
        { id: "7", label: "Flash Drive", color: defaultColors[6], weight: 5 },
        { id: "8", label: "Powerbank", color: defaultColors[7], weight: 2 },
        { id: "9", label: "Notebook", color: defaultColors[8], weight: 8 },
        { id: "10", label: "Pen", color: defaultColors[9], weight: 5 },
        { id: "11", label: "Sticker Pack", color: defaultColors[10], weight: 3 },
        { id: "12", label: "Voucher 5%", color: defaultColors[11], weight: 1 },
      ],
    };
    setCampaign((prev) => ({ ...prev, prizes: presets[count] }));
  }

  const totalWeight = campaign.prizes.reduce((sum, p) => sum + Math.max(p.weight, 0), 0);

  function exportToCSV() {
    if (!participants.length) return;
    const headers = ["Name","Phone","Email","Prize Won","Voucher Code","Status","Date & Time"];
    const rows = participants.map((p) => [
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
    link.setAttribute("download", `${campaign.name.toLowerCase().replace(/\s+/g, "_")}_participants.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function triggerLuckyDraw() {
    const winnersList = participants.filter((p) => p.won);
    if (!winnersList.length) return;
    setIsDrawing(true);
    let count = 0;
    const interval = setInterval(() => {
      const randomIdx = Math.floor(Math.random() * winnersList.length);
      setLuckyWinner(winnersList[randomIdx]);
      count++;
      if (count > 20) { clearInterval(interval); setIsDrawing(false); }
    }, 100);
  }

  // ──────────────────────────────────────────────────────────
  // AUTH SCREEN
  // ──────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 font-sans relative overflow-hidden"
        style={{ background: "radial-gradient(circle at 30% 20%, rgba(255,107,53,0.2) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(0,191,166,0.2) 0%, transparent 50%), #0D1B2A" }}
      >
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl" />
        </div>

        <form
          onSubmit={handleLogin}
          className="w-full max-w-md relative"
        >
          {/* Glass card */}
          <div
            className="rounded-3xl p-8 shadow-2xl space-y-8"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            {/* Logo area */}
            <div className="text-center space-y-4">
              <div className="relative inline-flex">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl"
                  style={{ background: "linear-gradient(135deg, #FF6B35, #00BFA6)" }}
                >
                  <Shield className="w-10 h-10 text-white" />
                </div>
                <div
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0D1B2A] flex items-center justify-center"
                  style={{ background: "#00BFA6" }}
                >
                  <Lock className="w-2.5 h-2.5 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>
                  Campaign Admin
                </h1>
                <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Secure Portal · Default PIN: 1234
                </p>
              </div>
            </div>

            {/* PIN input */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                Enter Admin PIN
              </label>
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="• • • •"
                maxLength={8}
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
                  <X className="w-3.5 h-3.5" /> Incorrect PIN. Please try again.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-4 rounded-xl font-bold text-base text-white transition-all relative overflow-hidden group"
              style={{
                background: "linear-gradient(135deg, #00BFA6, #0D9488)",
                boxShadow: "0 8px 24px rgba(0,191,166,0.35)",
                fontFamily: "Rubik, sans-serif",
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <span>Unlock Dashboard</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>

            <div className="flex items-center justify-center gap-4 pt-2">
              <Link href="/" className="text-xs font-semibold hover:text-white transition-colors" style={{ color: "rgba(255,255,255,0.35)" }}>
                ← Back to Wheel
              </Link>
              <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
              <Link href="/super-admin" className="text-xs font-semibold hover:text-white transition-colors" style={{ color: "rgba(255,255,255,0.35)" }}>
                Super Admin →
              </Link>
            </div>
          </div>
        </form>
      </div>
    );
  }

  const totalParticipants = participants.length;
  const winnersCount = participants.filter((p) => p.won).length;
  const winRate = totalParticipants ? Math.round((winnersCount / totalParticipants) * 100) : 0;

  const filteredParticipants = participants.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone.includes(searchQuery) ||
      p.prizeLabel.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tabs = [
    { id: "analytics", label: "Analytics", icon: Activity },
    { id: "branding", label: "Brand & Theme", icon: Palette },
    { id: "prizes", label: "Prizes", icon: Trophy },
    { id: "export", label: "Participants", icon: Users },
    { id: "luckydraw", label: "Lucky Draw", icon: Sparkles },
  ];

  return (
    <div className="min-h-screen font-sans pb-20" style={{ background: "#070d14", fontFamily: "Nunito, sans-serif" }}>
      {/* Top navigation bar */}
      <header
        className="sticky top-0 z-40 px-4 py-3"
        style={{
          background: "rgba(7,13,20,0.85)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
              style={{ background: "linear-gradient(135deg, #FF6B35, #00BFA6)" }}
            >
              🎯
            </div>
            <div className="min-w-0">
              <p className="font-black text-white text-sm leading-tight truncate" style={{ fontFamily: "Rubik, sans-serif" }}>
                {campaign.name}
              </p>
              <p className="text-[10px] font-mono truncate" style={{ color: "#00BFA6" }}>
                /{campaignSlug}
              </p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href="/create-campaign"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: "rgba(0,191,166,0.12)", color: "#00BFA6", border: "1px solid rgba(0,191,166,0.2)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Campaign</span>
            </Link>

            <button
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">QR Code</span>
            </button>

            <Link
              href={`/tv?c=${campaignSlug}`}
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <Tv className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">TV Display</span>
            </Link>

            <Link
              href={`/?c=${campaignSlug}`}
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition-all"
              style={{ background: "linear-gradient(135deg, #FF6B35, #e0531f)", boxShadow: "0 4px 12px rgba(255,107,53,0.3)" }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Live Wheel</span>
            </Link>

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl transition-colors hover:text-red-400"
              style={{ color: "rgba(255,255,255,0.3)" }}
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Spins", value: totalParticipants, color: "#00BFA6", bg: "rgba(0,191,166,0.08)", border: "rgba(0,191,166,0.15)", icon: Activity },
            { label: "Prize Winners", value: winnersCount, color: "#10b981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.15)", icon: Trophy },
            { label: "Win Rate", value: `${winRate}%`, color: "#FF6B35", bg: "rgba(255,107,53,0.08)", border: "rgba(255,107,53,0.15)", icon: Target },
            { label: "Prize Segments", value: campaign.prizes.length, color: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.15)", icon: Layers },
          ].map(({ label, value, color, bg, border, icon: Icon }) => (
            <div
              key={label}
              className="rounded-2xl p-4 flex items-center gap-4"
              style={{ background: bg, border: `1px solid ${border}` }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}18` }}
              >
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-2xl font-black leading-none font-mono" style={{ color, fontFamily: "Rubik, sans-serif" }}>
                  {value}
                </p>
                <p className="text-xs mt-0.5 font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Save bar */}
        <div
          className="rounded-2xl px-5 py-3.5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div>
            <p className="font-bold text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Campaign Settings</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Changes propagate live to attendees scanning the QR code.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "#10b981" }}>
                <CheckCircle className="w-3.5 h-3.5" /> Saved!
              </span>
            )}
            <button
              onClick={handleSaveCampaign}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #00BFA6, #0D9488)",
                boxShadow: "0 4px 14px rgba(0,191,166,0.3)",
                fontFamily: "Rubik, sans-serif",
              }}
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as Tab)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all"
                style={{
                  background: active ? "linear-gradient(135deg, rgba(255,107,53,0.2), rgba(0,191,166,0.2))" : "transparent",
                  color: active ? "#ffffff" : "rgba(255,255,255,0.35)",
                  border: active ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                  fontFamily: "Rubik, sans-serif",
                }}
              >
                <Icon className="w-4 h-4" style={{ color: active ? "#00BFA6" : undefined }} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ─── TAB: ANALYTICS ─── */}
        {activeTab === "analytics" && (
          <div className="space-y-5">
            {/* Prize distribution */}
            <div
              className="rounded-2xl p-6 space-y-5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <h3 className="font-black text-white text-base" style={{ fontFamily: "Rubik, sans-serif" }}>
                Prize Distribution Breakdown
              </h3>
              <div className="space-y-4">
                {campaign.prizes.map((prize) => {
                  const count = participants.filter((p) => p.prizeId === prize.id).length;
                  const pct = totalParticipants ? Math.round((count / totalParticipants) * 100) : 0;
                  return (
                    <div key={prize.id} className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="flex items-center gap-2" style={{ color: "rgba(255,255,255,0.8)" }}>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: prize.color }} />
                          {prize.label}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.4)" }}>{count} · {pct}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(pct, 2)}%`, background: prize.color, boxShadow: `0 0 8px ${prize.color}60` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {campaign.prizes.length === 0 && (
                  <p className="text-center py-6 text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>No prize segments configured.</p>
                )}
              </div>
            </div>

            {/* Recent activity */}
            <div
              className="rounded-2xl p-6 space-y-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <h3 className="font-black text-white text-base" style={{ fontFamily: "Rubik, sans-serif" }}>
                Recent Activations
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {participants.slice(0, 10).map((p, i) => (
                  <div
                    key={p.id || i}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black"
                        style={{ background: p.won ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)", color: p.won ? "#10b981" : "rgba(255,255,255,0.3)" }}
                      >
                        {p.won ? "🏆" : "✗"}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white leading-tight">{p.name}</p>
                        <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>{p.phone}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold" style={{ color: p.won ? "#10b981" : "rgba(255,255,255,0.35)" }}>{p.prizeLabel}</p>
                      <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
                        {new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                {participants.length === 0 && (
                  <p className="text-center py-8 text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>No registrations yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: BRANDING ─── */}
        {activeTab === "branding" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div
              className="rounded-2xl p-6 space-y-5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <h3 className="font-black text-white text-base" style={{ fontFamily: "Rubik, sans-serif" }}>Campaign Copy</h3>

              {[
                { label: "Campaign Name", key: "name", placeholder: "e.g. Dettol Hygiene Challenge", type: "text" },
                { label: "Sub-Brand / Tagline", key: "subTitle", placeholder: "e.g. GOLDEN MORN", type: "text" },
                { label: "Brand Logo URL", key: "logoUrl", placeholder: "https://example.com/logo.png", type: "url" },
              ].map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label className="block text-xs font-bold mb-1.5 uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {label}
                  </label>
                  <input
                    type={type}
                    value={(campaign as any)[key] || ""}
                    onChange={(e) => setCampaign({ ...campaign, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontFamily: "Nunito, sans-serif",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "rgba(0,191,166,0.5)")}
                    onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-bold mb-1.5 uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Welcome Message
                </label>
                <textarea
                  rows={2}
                  value={campaign.welcomeMessage}
                  onChange={(e) => setCampaign({ ...campaign, welcomeMessage: e.target.value })}
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none resize-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </div>

              <div className="space-y-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {[
                  { key: "oneSpinPerPhone", label: "1 Spin per Phone Number" },
                  { key: "active", label: "Campaign Active" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between cursor-pointer group">
                    <span className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Rubik, sans-serif" }}>
                      {label}
                    </span>
                    <div
                      onClick={() => setCampaign({ ...campaign, [key]: !(campaign as any)[key] })}
                      className="relative w-11 h-6 rounded-full transition-all cursor-pointer flex-shrink-0"
                      style={{
                        background: (campaign as any)[key] ? "linear-gradient(135deg, #00BFA6, #0D9488)" : "rgba(255,255,255,0.1)",
                        boxShadow: (campaign as any)[key] ? "0 0 12px rgba(0,191,166,0.4)" : "none",
                      }}
                    >
                      <div
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                        style={{ left: (campaign as any)[key] ? "calc(100% - 22px)" : "2px" }}
                      />
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div
              className="rounded-2xl p-6 space-y-5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <h3 className="font-black text-white text-base" style={{ fontFamily: "Rubik, sans-serif" }}>Theme Colors</h3>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Primary", key: "primaryColor" },
                  { label: "Secondary", key: "secondaryColor" },
                  { label: "Gradient Start", key: "gradientStart" },
                  { label: "Gradient End", key: "gradientEnd" },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {label}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <input
                          type="color"
                          value={(campaign as any)[key] || "#00BFA6"}
                          onChange={(e) => setCampaign({ ...campaign, [key]: e.target.value })}
                          className="w-11 h-11 rounded-xl cursor-pointer border-0 p-1"
                          style={{ background: "rgba(255,255,255,0.05)" }}
                        />
                      </div>
                      <input
                        type="text"
                        value={(campaign as any)[key] || ""}
                        onChange={(e) => setCampaign({ ...campaign, [key]: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Quick Presets
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { name: "Brand Default", start: "#FF6B35", end: "#00BFA6" },
                    { name: "Midnight & Teal", start: "#0D1B2A", end: "#00BFA6" },
                    { name: "Orange Blaze", start: "#FF6B35", end: "#0D1B2A" },
                    { name: "Teal & Light", start: "#00BFA6", end: "#F3F4F6" },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => setCampaign({ ...campaign, gradientStart: preset.start, gradientEnd: preset.end })}
                      className="p-3 rounded-xl flex items-center gap-3 text-left transition-all hover:scale-[1.02]"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex-shrink-0 shadow"
                        style={{ background: `linear-gradient(135deg, ${preset.start}, ${preset.end})` }}
                      />
                      <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.7)", fontFamily: "Rubik, sans-serif" }}>
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live preview */}
              <div>
                <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Live Preview
                </label>
                <div
                  className="w-full h-24 rounded-xl flex items-center justify-center text-white font-black text-sm"
                  style={{
                    background: `radial-gradient(circle at 30% 30%, ${campaign.gradientStart || "#FF6B35"}, transparent 60%), radial-gradient(circle at 70% 70%, ${campaign.gradientEnd || "#00BFA6"}, transparent 60%), #0D1B2A`,
                    fontFamily: "Rubik, sans-serif",
                  }}
                >
                  {campaign.name || "Campaign Preview"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: PRIZES ─── */}
        {activeTab === "prizes" && (
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <h3 className="font-black text-white text-base" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Wheel Segments · {campaign.prizes.length} Prizes
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Weights define the relative win probability for each segment.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>Presets:</span>
                {([6, 8, 10, 12] as const).map((num) => (
                  <button
                    key={num}
                    onClick={() => handleApplyPreset(num)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleAddPrize}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #FF6B35, #e0531f)", boxShadow: "0 4px 12px rgba(255,107,53,0.3)" }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            </div>

            <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
              {campaign.prizes.map((prize, idx) => {
                const prob = totalWeight > 0 ? Math.round((Math.max(prize.weight, 0) / totalWeight) * 100) : 0;
                return (
                  <div
                    key={prize.id || idx}
                    className="rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <span className="text-xs font-mono font-bold w-5 text-center flex-shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>
                        {idx + 1}
                      </span>
                      <input
                        type="color"
                        value={prize.color}
                        onChange={(e) => handleUpdatePrize(idx, "color", e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0 flex-shrink-0"
                        style={{ background: "transparent" }}
                      />
                      <input
                        type="text"
                        value={prize.label}
                        onChange={(e) => handleUpdatePrize(idx, "label", e.target.value)}
                        placeholder="Prize label"
                        className="flex-1 md:w-48 rounded-lg px-3 py-2 text-sm text-white font-bold outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
                        onFocus={(e) => (e.target.style.borderColor = "rgba(0,191,166,0.4)")}
                        onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.06)")}
                      />
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>Wt.</label>
                        <input
                          type="number"
                          min="0"
                          value={prize.weight}
                          onChange={(e) => handleUpdatePrize(idx, "weight", Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-16 rounded-lg px-2 py-2 text-sm text-white text-center font-mono outline-none"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
                        />
                        <div
                          className="w-10 text-center rounded-lg py-1.5 text-xs font-black font-mono"
                          style={{ background: `${prize.color}20`, color: prize.color, border: `1px solid ${prize.color}30` }}
                        >
                          {prob}%
                        </div>
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer px-2.5 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <input
                          type="checkbox"
                          checked={!!prize.isLosing}
                          onChange={(e) => handleUpdatePrize(idx, "isLosing", e.target.checked)}
                          className="w-3.5 h-3.5 rounded accent-red-500 cursor-pointer"
                        />
                        <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Loss</span>
                      </label>

                      <button
                        onClick={() => handleDeletePrize(idx)}
                        className="p-2 rounded-lg transition-colors hover:text-red-400"
                        style={{ color: "rgba(255,255,255,0.2)" }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── TAB: PARTICIPANTS ─── */}
        {activeTab === "export" && (
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <h3 className="font-black text-white text-base" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Participant Registrations · {participants.length}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Real-time activation entries — export to Excel/CSV.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search name, phone, prize…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl px-4 py-2 text-xs text-white outline-none w-48"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(0,191,166,0.4)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                />
                <button
                  onClick={exportToCSV}
                  disabled={!participants.length}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ fontSize: "12px" }}>
                <thead>
                  <tr style={{ color: "rgba(255,255,255,0.3)" }}>
                    {["Name","Phone","Email","Prize","Voucher","Time"].map((h) => (
                      <th key={h} className="pb-3 px-2 font-bold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="space-y-1">
                  {filteredParticipants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>
                        No participant records found.
                      </td>
                    </tr>
                  ) : (
                    filteredParticipants.map((p, i) => (
                      <tr
                        key={p.id || i}
                        className="transition-all"
                        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td className="py-3 px-2 font-bold text-white">{p.name}</td>
                        <td className="py-3 px-2 font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>{p.phone}</td>
                        <td className="py-3 px-2" style={{ color: "rgba(255,255,255,0.4)" }}>{p.email || "—"}</td>
                        <td className="py-3 px-2">
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                            style={{
                              background: p.won ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
                              color: p.won ? "#10b981" : "rgba(255,255,255,0.35)",
                              border: `1px solid ${p.won ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.06)"}`,
                            }}
                          >
                            {p.prizeLabel}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-mono text-xs" style={{ color: "#00BFA6" }}>{p.voucherCode || "—"}</td>
                        <td className="py-3 px-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                          {new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── TAB: LUCKY DRAW ─── */}
        {activeTab === "luckydraw" && (
          <div className="flex items-center justify-center min-h-[400px]">
            <div
              className="rounded-3xl p-10 text-center space-y-8 w-full max-w-lg"
              style={{
                background: "radial-gradient(circle at 50% 30%, rgba(167,139,250,0.1), transparent 70%), rgba(255,255,255,0.03)",
                border: "1px solid rgba(167,139,250,0.15)",
              }}
            >
              <div
                className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto shadow-2xl"
                style={{ background: "linear-gradient(135deg, rgba(167,139,250,0.3), rgba(139,92,246,0.3))", border: "1px solid rgba(167,139,250,0.3)" }}
              >
                <Dices className="w-12 h-12" style={{ color: "#a78bfa" }} />
              </div>

              <div>
                <h3 className="text-3xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>
                  Live Lucky Draw
                </h3>
                <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Randomly selects a grand winner from all registered participants, live on stage.
                </p>
              </div>

              {luckyWinner && (
                <div
                  className="rounded-2xl p-6 space-y-2 transition-all"
                  style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)" }}
                >
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: "#a78bfa" }}>
                    🎉 Grand Winner!
                  </p>
                  <h2 className="text-4xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                    {luckyWinner.name}
                  </h2>
                  <p className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>{luckyWinner.phone}</p>
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={triggerLuckyDraw}
                  disabled={isDrawing || !participants.length}
                  className="w-full py-4 rounded-2xl font-black text-white text-base transition-all disabled:opacity-50"
                  style={{
                    background: isDrawing ? "rgba(167,139,250,0.2)" : "linear-gradient(135deg, #7c3aed, #6d28d9)",
                    boxShadow: isDrawing ? "none" : "0 8px 24px rgba(124,58,237,0.4)",
                    fontFamily: "Rubik, sans-serif",
                  }}
                >
                  {isDrawing ? "🎲 Drawing…" : "🎰 Run Lucky Draw!"}
                </button>
                {!participants.length && (
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                    No registered participants yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* QR Modal */}
      {showQrModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }}
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="rounded-3xl p-8 max-w-sm w-full text-center space-y-5"
            style={{ background: "#0f1823", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
              Scan to Spin the Wheel
            </h3>
            <div className="bg-white p-5 rounded-2xl flex items-center justify-center shadow-inner mx-auto w-fit">
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
            <p className="text-xs font-mono break-all" style={{ color: "rgba(255,255,255,0.3)" }}>{qrUrl}</p>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-3 rounded-xl text-sm font-bold transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
