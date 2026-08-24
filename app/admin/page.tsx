"use client";

import { useEffect, useState } from "react";
import type { Campaign, Participant, Prize, StoreLocation } from "@/types";
import {
  getCampaign,
  updateCampaign,
  getParticipants,
  clearCampaignData,
  subscribeCampaign,
  subscribeParticipants,
  getSuperAdminConfig,
  DEFAULT_CAMPAIGN,
} from "@/lib/campaign";
import Link from "next/link";
import {
  Settings, Trophy, Users, BarChart3, Download, QrCode, Tv,
  Plus, Trash2, Lock, LogOut, Sparkles, CheckCircle, Dices,
  ExternalLink, Palette, Save, Activity, Target, Layers,
  ChevronRight, Shield, X, Check, Store, MapPin, UserCheck, Copy, AlertTriangle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { getGradientContrastColor, isLightColor } from "@/lib/colors";

type Tab = "analytics" | "branding" | "prizes" | "stores" | "export" | "luckydraw";

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [campaign, setCampaign] = useState<Campaign>(DEFAULT_CAMPAIGN);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("analytics");
  const [showQrModal, setShowQrModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearPasswordInput, setClearPasswordInput] = useState("");
  const [clearError, setClearError] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [campaignSlug, setCampaignSlug] = useState("");
  const [luckyWinner, setLuckyWinner] = useState<Participant | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");

  // Store management state
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreCode, setNewStoreCode] = useState("");
  const [newStoreCity, setNewStoreCity] = useState("");
  const [newStorePin, setNewStorePin] = useState("1234");
  const [selectedStoreForQr, setSelectedStoreForQr] = useState<StoreLocation | null>(null);
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeToast, setStoreToast] = useState<string | null>(null);

  async function handleAddStore(e: React.FormEvent) {
    e.preventDefault();
    if (!newStoreName.trim()) return;
    setStoreSaving(true);
    const code = newStoreCode.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || `store-${Date.now().toString(36)}`;
    const newStore: StoreLocation = {
      id: `store-${Date.now()}`,
      name: newStoreName.trim(),
      code,
      city: newStoreCity.trim() || undefined,
      pin: newStorePin.trim() || undefined,
    };
    const updatedStores = [...(campaign.stores || []), newStore];
    const updatedCampaign = { ...campaign, stores: updatedStores };
    setCampaign(updatedCampaign);
    setNewStoreName("");
    setNewStoreCode("");
    setNewStoreCity("");
    setNewStorePin("1234");

    try {
      await updateCampaign(updatedCampaign);
      setStoreToast(`✅ "${newStore.name}" added and saved live!`);
      setTimeout(() => setStoreToast(null), 3000);
    } catch (err) {
      console.error("Failed to persist store to Firestore:", err);
      alert("❌ Could not save store to database. Please check connection.");
    } finally {
      setStoreSaving(false);
    }
  }

  async function handleDeleteStore(storeId: string) {
    const target = (campaign.stores || []).find(s => s.id === storeId || s.code === storeId);
    if (!window.confirm(`Delete store / BA account "${target?.name || storeId}"?`)) return;
    const updatedStores = (campaign.stores || []).filter(s => s.id !== storeId && s.code !== storeId);
    const updatedCampaign = { ...campaign, stores: updatedStores };
    setCampaign(updatedCampaign);

    try {
      await updateCampaign(updatedCampaign);
      setStoreToast("🗑️ Store account removed.");
      setTimeout(() => setStoreToast(null), 3000);
    } catch (err) {
      console.error("Failed to delete store from Firestore:", err);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const slug = params.get("c") || process.env.NEXT_PUBLIC_CAMPAIGN_ID || "";
      setCampaignSlug(slug);
      setQrUrl(`${window.location.origin}/?c=${slug}`);
      if (sessionStorage.getItem("admin_authed") === "true") setAuthenticated(true);
    }
  }, []);

  const [clearing, setClearing] = useState(false);

  // Fetch campaign configuration immediately — used only before auth to display name
  useEffect(() => {
    if (!campaignSlug) return;
    getCampaign(campaignSlug).then((c) => {
      if (c) setCampaign(c);
    });
  }, [campaignSlug]);

  // Live real-time campaign & participant listener once authenticated
  useEffect(() => {
    if (!authenticated || !campaignSlug) return;

    setLoading(true);
    const unsubCampaign = subscribeCampaign(campaignSlug, (c) => setCampaign(c));
    const unsubParticipants = subscribeParticipants(campaignSlug, (p) => {
      setParticipants(p);
      setLoading(false);
    });

    return () => {
      unsubCampaign();
      unsubParticipants();
    };
  }, [authenticated, campaignSlug]);

  function handleOpenClearModal() {
    setClearPasswordInput("");
    setClearError("");
    setShowClearModal(true);
  }

  async function handleConfirmClearDatabase(e: React.FormEvent) {
    e.preventDefault();
    setClearError("");
    setClearing(true);
    try {
      const superCfg = await getSuperAdminConfig();
      const isSuperAdmin = superCfg && clearPasswordInput === superCfg.password;
      const isCampaignAdmin = campaign.adminPassword && clearPasswordInput === campaign.adminPassword;

      if (!isSuperAdmin && !isCampaignAdmin) {
        setClearError("Incorrect admin password. Database reset denied.");
        setClearing(false);
        return;
      }

      const res = await clearCampaignData(campaignSlug);
      setParticipants([]);
      setShowClearModal(false);
      setClearPasswordInput("");
      alert(`✅ Database cleared! Deleted ${res.deletedCount} participant record(s) and reset prize claimed stock counts in Firestore.`);
    } catch (err) {
      setClearError("Failed to clear database. Check Firestore permissions.");
    } finally {
      setClearing(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const c = await getCampaign(campaignSlug);
      if (!c) {
        setLoginError("Campaign not found. Check the URL ?c= parameter.");
        return;
      }
      const emailOk = emailInput.trim().toLowerCase() === (c.adminEmail || "").toLowerCase();
      const passOk = passwordInput === c.adminPassword;
      if (emailOk && passOk) {
        setCampaign(c);
        setAuthenticated(true);
        sessionStorage.setItem("admin_authed", "true");
      } else {
        setLoginError("Incorrect email or password.");
      }
    } catch (err) {
      setLoginError("Login failed. Check your Firebase connection.");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    setAuthenticated(false);
    sessionStorage.removeItem("admin_authed");
  }

  async function handleSave() {
    setSaving(true);
    await updateCampaign(campaign);
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  function handleAddPrize() {
    const p: Prize = { id: `prize-${Date.now()}`, label: "New Prize", color: "#00BFA6", weight: 10, isLosing: false };
    setCampaign(prev => ({ ...prev, prizes: [...prev.prizes, p] }));
  }

  function handleUpdatePrize(idx: number, field: keyof Prize, value: any) {
    setCampaign(prev => {
      const arr = [...prev.prizes];
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...prev, prizes: arr };
    });
  }

  function handleDeletePrize(idx: number) {
    setCampaign(prev => ({ ...prev, prizes: prev.prizes.filter((_, i) => i !== idx) }));
  }

  function exportToCSV() {
    const headers = ["Name", "Phone", "Email", "Prize Won", "Voucher Code", "Status", "Store / BA Name", "Store Code", "Date & Time"];
    const rows = participants.map(p => [
      `"${p.name}"`, `"${p.phone}"`, `"${p.email || ""}"`,
      `"${p.prizeLabel}"`, `"${p.voucherCode || ""}"`,
      p.won ? "Winner" : "Non-Winner",
      `"${p.storeName || "General Stage"}"`,
      `"${p.storeCode || ""}"`,
      `"${new Date(p.createdAt).toLocaleString()}"`,
    ]);
    const csv = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", `${campaign.name.toLowerCase().replace(/\s+/g, "_")}_participants.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function triggerLuckyDraw() {
    const winners = participants.filter(p => p.won);
    if (!winners.length) return;
    setIsDrawing(true);
    let count = 0;
    const interval = setInterval(() => {
      setLuckyWinner(winners[Math.floor(Math.random() * winners.length)]);
      if (++count > 20) { clearInterval(interval); setIsDrawing(false); }
    }, 100);
  }

  const totalWeight = campaign.prizes.reduce((s, p) => s + Math.max(p.weight, 0), 0);
  const totalParticipants = participants.length;
  const winnersCount = participants.filter(p => p.won).length;
  const winRate = totalParticipants ? Math.round((winnersCount / totalParticipants) * 100) : 0;
  const filtered = participants.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.phone.includes(searchQuery) ||
    p.prizeLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.storeName && p.storeName.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.storeCode && p.storeCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.voucherCode && p.voucherCode.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // ─── LOGIN SCREEN ───────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{
        background: "radial-gradient(ellipse at 30% 20%, rgba(255,107,53,0.18) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(0,191,166,0.18) 0%, transparent 50%), #0A1628",
        fontFamily: "Nunito, sans-serif",
      }}>
        <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "#FF6B35" }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "#00BFA6" }} />

        <form onSubmit={handleLogin} className="relative w-full max-w-md">
          <div className="rounded-3xl p-8 space-y-6" style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl" style={{ background: "linear-gradient(135deg, #FF6B35, #00BFA6)" }}>
                  <Shield className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{ background: "#00BFA6", borderColor: "#0A1628" }}>
                  <Lock className="w-3 h-3 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>Admin Portal</h1>
                <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>Sign in with your campaign admin credentials.</p>
              </div>
            </div>

            {!campaignSlug && (
              <div className="rounded-xl px-4 py-3 text-xs font-semibold text-amber-400" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
                ⚠️ No campaign selected. Add <code className="font-mono">?c=your-campaign-id</code> to the URL.
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Admin Email</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => { setEmailInput(e.target.value); setLoginError(""); }}
                  placeholder="admin@brand.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: loginError ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(255,255,255,0.1)",
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={passwordInput}
                    onChange={e => { setPasswordInput(e.target.value); setLoginError(""); }}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full rounded-xl px-4 py-3 pr-12 text-sm text-white outline-none transition-all"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: loginError ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(255,255,255,0.1)",
                    }}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold transition-colors"
                    style={{ color: "rgba(255,255,255,0.35)" }}>
                    {showPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>
              </div>
              {loginError && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                  <X className="w-3.5 h-3.5" /> {loginError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loginLoading || !campaignSlug}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 group transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #00BFA6, #0D9488)",
                boxShadow: "0 8px 24px rgba(0,191,166,0.35)",
                fontFamily: "Rubik, sans-serif",
              }}
            >
              {loginLoading ? "Verifying..." : <>Unlock Dashboard <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>}
            </button>

            <div className="flex items-center justify-center gap-4 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
              <Link href="/" className="hover:text-white transition-colors">← Back to Wheel</Link>
              <span className="opacity-30">·</span>
              <Link href="/super-admin" className="hover:text-white transition-colors">Super Admin →</Link>
            </div>
          </div>
        </form>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "analytics", label: "Analytics", icon: Activity },
    { id: "branding", label: "Brand & Theme", icon: Palette },
    { id: "prizes", label: "Prizes & Stock", icon: Trophy },
    { id: "stores", label: "Stores & BAs", icon: Store },
    { id: "export", label: "Participants", icon: Users },
    { id: "luckydraw", label: "Lucky Draw", icon: Sparkles },
  ];

  // ─── DASHBOARD ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-20" style={{ background: "#070d14", fontFamily: "Nunito, sans-serif" }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 px-4 sm:px-6 py-3" style={{
        background: "rgba(7,13,20,0.9)", backdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background: "linear-gradient(135deg, #FF6B35, #00BFA6)" }}>
              🎯
            </div>
            <div className="min-w-0">
              <p className="font-black text-white text-sm leading-tight truncate" style={{ fontFamily: "Rubik, sans-serif" }}>
                {campaign.name}
              </p>
              <p className="text-[10px] font-mono" style={{ color: "#00BFA6" }}>/{campaignSlug}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/create-campaign" className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: "rgba(0,191,166,0.1)", color: "#00BFA6", border: "1px solid rgba(0,191,166,0.2)" }}>
              <Plus className="w-3.5 h-3.5" /> New Campaign
            </Link>
            <button onClick={() => setShowQrModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <QrCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">QR Code</span>
            </button>
            <Link href={`/tv?c=${campaignSlug}`} target="_blank" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Tv className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">TV</span>
            </Link>
            <button
              onClick={handleOpenClearModal}
              disabled={clearing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all text-red-400 bg-red-950/30 border border-red-500/30 hover:bg-red-900/40 cursor-pointer"
              title="Clear all spin participants and reset prize stock counts for this campaign in Firestore (Admin Password Required)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Clear DB</span>
            </button>
            <button onClick={handleLogout} className="p-2 rounded-xl text-xs transition-colors hover:text-red-400" style={{ color: "rgba(255,255,255,0.3)" }}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-5">

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Spins", value: totalParticipants, color: "#00BFA6", icon: Activity },
            { label: "Winners", value: winnersCount, color: "#10b981", icon: Trophy },
            { label: "Win Rate", value: `${winRate}%`, color: "#FF6B35", icon: Target },
            { label: "Segments", value: campaign.prizes.length, color: "#a78bfa", icon: Layers },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="rounded-2xl p-4 flex items-center gap-4" style={{ background: `${color}0d`, border: `1px solid ${color}25` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-2xl font-black leading-none font-mono" style={{ color, fontFamily: "Rubik, sans-serif" }}>{value}</p>
                <p className="text-xs mt-0.5 font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Save Bar ── */}
        <div className="rounded-2xl px-5 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <p className="font-bold text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Campaign Settings</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Changes propagate live to all attendees.</p>
          </div>
          <div className="flex items-center gap-3">
            {saveSuccess && <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400"><CheckCircle className="w-3.5 h-3.5" /> Saved!</span>}
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-50 transition-all hover:opacity-90 active:scale-[0.98]" style={{ background: "linear-gradient(135deg, #00BFA6, #0D9488)", boxShadow: "0 4px 14px rgba(0,191,166,0.3)", fontFamily: "Rubik, sans-serif" }}>
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all"
                style={{
                  background: active ? "rgba(255,255,255,0.08)" : "transparent",
                  color: active ? "#ffffff" : "rgba(255,255,255,0.35)",
                  border: active ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                  fontFamily: "Rubik, sans-serif",
                }}
              >
                <Icon className="w-4 h-4" style={{ color: active ? "#00BFA6" : undefined }} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Analytics Tab ── */}
        {activeTab === "analytics" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between">
                <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Prize Distribution & Inventory</h3>
                <span className="text-xs font-bold text-white/40">Claimed / Stock</span>
              </div>
              <div className="space-y-4">
                {campaign.prizes.map(prize => {
                  const count = participants.filter(p => p.prizeId === prize.id).length || prize.claimedCount || 0;
                  const pct = totalParticipants ? Math.round((count / totalParticipants) * 100) : 0;
                  const hasLimit = prize.quantity !== undefined && prize.quantity !== null && prize.quantity >= 0;
                  const remaining = hasLimit ? Math.max(0, prize.quantity! - count) : Infinity;
                  const isOut = !prize.isLosing && hasLimit && remaining <= 0;

                  return (
                    <div key={prize.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="flex items-center gap-2 truncate" style={{ color: "rgba(255,255,255,0.8)" }}>
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: prize.color }} />
                          <span className="truncate">{prize.label}</span>
                          {isOut && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 font-mono uppercase">OUT</span>}
                        </span>
                        <span className="font-mono text-xs flex-shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {count} {hasLimit ? `/ ${prize.quantity}` : ""} {hasLimit ? `(${remaining} left)` : "claimed"}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 2)}%`, background: isOut ? "#ef4444" : prize.color, boxShadow: `0 0 6px ${isOut ? "#ef4444" : prize.color}60` }} />
                      </div>
                    </div>
                  );
                })}
                {!campaign.prizes.length && <p className="text-center py-6 text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>No prizes configured.</p>}
              </div>
            </div>

            <div className="rounded-2xl p-6 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Recent Activations</h3>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {participants.slice(0, 10).map((p, i) => (
                  <div key={p.id || i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs" style={{ background: p.won ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)" }}>
                        {p.won ? "🏆" : "✗"}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white leading-tight">{p.name}</p>
                        <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>{p.phone}</p>
                      </div>
                    </div>
                    <p className="text-xs font-bold" style={{ color: p.won ? "#10b981" : "rgba(255,255,255,0.3)" }}>{p.prizeLabel}</p>
                  </div>
                ))}
                {!participants.length && <p className="text-center py-8 text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>No activations yet.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Branding Tab ── */}
        {activeTab === "branding" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Campaign Copy</h3>
              <div className="space-y-4">
                {[
                  { label: "Campaign Name", key: "name", type: "text", placeholder: "e.g. Dettol Hygiene Challenge" },
                  { label: "Sub-Brand / Tagline", key: "subTitle", type: "text", placeholder: "e.g. GOLDEN MORN" },
                  { label: "Brand Logo URL", key: "logoUrl", type: "url", placeholder: "https://example.com/logo.png" },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</label>
                    <input type={type} value={(campaign as any)[key] || ""} onChange={e => setCampaign({ ...campaign, [key]: e.target.value })} placeholder={placeholder}
                      className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      onFocus={e => (e.target.style.borderColor = "rgba(0,191,166,0.5)")}
                      onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.08)")} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Welcome Message</label>
                  <textarea rows={2} value={campaign.welcomeMessage} onChange={e => setCampaign({ ...campaign, welcomeMessage: e.target.value })}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none resize-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
                <div className="space-y-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {[{ key: "oneSpinPerPhone", label: "1 Spin per Phone" }, { key: "active", label: "Campaign Active" }].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{label}</span>
                      <button type="button" onClick={() => setCampaign({ ...campaign, [key]: !(campaign as any)[key] })}
                        className="relative w-11 h-6 rounded-full transition-all"
                        style={{ background: (campaign as any)[key] ? "linear-gradient(135deg, #00BFA6, #0D9488)" : "rgba(255,255,255,0.1)", boxShadow: (campaign as any)[key] ? "0 0 10px rgba(0,191,166,0.4)" : "none" }}>
                        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: (campaign as any)[key] ? "calc(100% - 22px)" : "2px" }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Theme & Full-Page Visual Identity</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Primary Accent", key: "primaryColor" },
                  { label: "Secondary Accent", key: "secondaryColor" },
                  { label: "Gradient Start", key: "gradientStart" },
                  { label: "Gradient End", key: "gradientEnd" },
                  { label: "Base Background", key: "backgroundColor" },
                ].map(({ label, key }) => (
                  <div key={key} className={key === "backgroundColor" ? "col-span-2" : ""}>
                    <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={(campaign as any)[key] || (key === "backgroundColor" ? "#070d14" : "#00BFA6")} onChange={e => setCampaign({ ...campaign, [key]: e.target.value })}
                        className="w-11 h-11 rounded-xl cursor-pointer border-0 p-1" style={{ background: "rgba(255,255,255,0.05)" }} />
                      <input type="text" value={(campaign as any)[key] || ""} onChange={e => setCampaign({ ...campaign, [key]: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-bold mb-3 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Preset Color Schemes</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: "Brand Default", start: "#FF6B35", end: "#00BFA6", bg: "#070d14", pri: "#00BFA6", sec: "#FF6B35" },
                    { name: "Minimal White", start: "#FFFFFF", end: "#94A3B8", bg: "#090D14", pri: "#FFFFFF", sec: "#38BDF8" },
                    { name: "Deep Ocean", start: "#0D1B2A", end: "#00BFA6", bg: "#06101c", pri: "#00BFA6", sec: "#38bdf8" },
                    { name: "Sunset Blaze", start: "#FF6B35", end: "#e11d48", bg: "#140608", pri: "#FF6B35", sec: "#fbbf24" },
                    { name: "Neon Violet", start: "#8b5cf6", end: "#ec4899", bg: "#0d0618", pri: "#8b5cf6", sec: "#ec4899" },
                    { name: "Emerald Gold", start: "#10b981", end: "#f59e0b", bg: "#04140d", pri: "#10b981", sec: "#f59e0b" },
                  ].map(p => (
                    <button key={p.name} onClick={() => setCampaign({ ...campaign, gradientStart: p.start, gradientEnd: p.end, backgroundColor: p.bg, primaryColor: p.pri, secondaryColor: p.sec })}
                      className="p-3 rounded-xl flex items-center gap-3 text-left transition-all hover:scale-[1.02] cursor-pointer"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="w-8 h-8 rounded-lg flex-shrink-0 shadow border border-white/20" style={{ background: `linear-gradient(135deg, ${p.start}, ${p.end})` }} />
                      <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                    Live Preview & Contrast Feedback
                  </label>
                  {(isLightColor(campaign.primaryColor || "") || isLightColor(campaign.secondaryColor || "") || isLightColor(campaign.gradientStart || "") || isLightColor(campaign.gradientEnd || "")) && (
                    <span className="text-[10px] text-teal-300 font-bold bg-teal-950/50 border border-teal-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3 text-teal-400" />
                      Auto High-Contrast Mode Active
                    </span>
                  )}
                </div>

                <div className="w-full h-32 rounded-2xl flex flex-col items-center justify-center text-white border border-white/10 p-3 relative overflow-hidden" style={{
                  background: `radial-gradient(circle at 20% 20%, ${campaign.gradientStart || "#FF6B35"}60 0%, transparent 60%), radial-gradient(circle at 80% 80%, ${campaign.gradientEnd || "#00BFA6"}50 0%, transparent 60%), ${campaign.backgroundColor || "#070d14"}`,
                  fontFamily: "Rubik, sans-serif",
                }}>
                  <span className="text-base font-black">{campaign.name || "Live Aura Preview"}</span>
                  {campaign.subTitle && (
                    <span
                      className="text-[10px] uppercase font-bold mt-1 px-2.5 py-0.5 rounded-full"
                      style={{
                        color: isLightColor(campaign.secondaryColor) ? "#ffffff" : (campaign.secondaryColor || "#FF6B35"),
                        background: isLightColor(campaign.secondaryColor) ? "rgba(255,255,255,0.18)" : `${campaign.secondaryColor || "#FF6B35"}20`,
                        border: `1px solid ${isLightColor(campaign.secondaryColor) ? "rgba(255,255,255,0.3)" : `${campaign.secondaryColor || "#FF6B35"}40`}`,
                      }}
                    >
                      {campaign.subTitle}
                    </span>
                  )}
                  <div
                    className="mt-2.5 px-3.5 py-1 rounded-xl text-xs font-black shadow-md"
                    style={{
                      background: `linear-gradient(135deg, ${campaign.primaryColor || "#00BFA6"}, ${campaign.secondaryColor || "#FF6B35"})`,
                      color: getGradientContrastColor(campaign.primaryColor || "#00BFA6", campaign.secondaryColor || "#FF6B35"),
                    }}
                  >
                    🎡 Spin Button Contrast Preview
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Prizes Tab ── */}
        {activeTab === "prizes" && (
          <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Wheel Segments & Gift Inventory Pool · {campaign.prizes.length}</h3>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Set probability weights and initial gift stock limits. Items automatically stop winning when out of stock.</p>
              </div>
              <button onClick={handleAddPrize} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #FF6B35, #e0531f)", boxShadow: "0 4px 12px rgba(255,107,53,0.3)" }}>
                <Plus className="w-3.5 h-3.5" /> Add Segment
              </button>
            </div>
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {campaign.prizes.map((prize, idx) => {
                const prob = totalWeight > 0 ? Math.round((Math.max(prize.weight, 0) / totalWeight) * 100) : 0;
                const wonCount = participants.filter(p => p.prizeId === prize.id).length || prize.claimedCount || 0;
                const hasLimit = prize.quantity !== undefined && prize.quantity !== null && prize.quantity >= 0;
                const remaining = hasLimit ? Math.max(0, prize.quantity! - wonCount) : Infinity;
                const isOutOfStock = !prize.isLosing && hasLimit && remaining <= 0;

                return (
                  <div key={prize.id || idx} className={`rounded-xl p-4 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 transition-all ${isOutOfStock ? "opacity-75 bg-red-950/20 border-red-500/30" : "bg-white/[0.03] border-white/5"}`} style={{ border: isOutOfStock ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.06)" }}>
                    {/* Left: Color + Label */}
                    <div className="flex items-center gap-3 w-full xl:w-auto">
                      <span className="text-xs font-mono w-5 text-center" style={{ color: "rgba(255,255,255,0.2)" }}>{idx + 1}</span>
                      <input type="color" value={prize.color} onChange={e => handleUpdatePrize(idx, "color", e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border-0 flex-shrink-0" style={{ background: "transparent" }} />
                      <input type="text" value={prize.label} onChange={e => handleUpdatePrize(idx, "label", e.target.value)} placeholder="Prize label"
                        className="flex-1 xl:w-44 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }} />
                    </div>

                    {/* Middle: Weight + Probability */}
                    <div className="flex items-center gap-3 flex-wrap w-full xl:w-auto justify-between xl:justify-end">
                      <div className="flex items-center gap-1.5" title="Relative Probability Weight">
                        <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>Wt.</span>
                        <input type="number" min="0" value={prize.weight} onChange={e => handleUpdatePrize(idx, "weight", Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-14 rounded-lg px-2 py-1.5 text-xs text-white text-center font-mono outline-none"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }} />
                        <div className="px-2 py-1 rounded-lg text-xs font-black font-mono" style={{ background: `${prize.color}20`, color: prize.color, border: `1px solid ${prize.color}30` }}>
                          {prob}%
                        </div>
                      </div>

                      {/* Gift Stock Pool Controls */}
                      {!prize.isLosing ? (
                        <div className="flex items-center gap-2 bg-white/[0.04] p-1.5 rounded-lg border border-white/5">
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] font-bold uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>Stock Limit</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="∞"
                              value={prize.quantity !== undefined && prize.quantity !== null ? prize.quantity : ""}
                              onChange={e => {
                                const val = e.target.value === "" ? undefined : Math.max(0, parseInt(e.target.value) || 0);
                                handleUpdatePrize(idx, "quantity", val);
                              }}
                              className="w-16 rounded-md px-2 py-1 text-xs text-white text-center font-mono outline-none"
                              style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
                              title="Leave empty for unlimited stock"
                            />
                          </div>

                          <div className="h-4 w-px bg-white/10" />

                          {/* Inventory Badges */}
                          <div className="flex items-center gap-1.5 text-xs font-bold font-mono">
                            <span className="text-emerald-400">{wonCount} won</span>
                            <span className="text-white/20">/</span>
                            {isOutOfStock ? (
                              <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] uppercase tracking-wider animate-pulse">
                                Out of Stock
                              </span>
                            ) : (
                              <span className="text-teal-300">
                                {hasLimit ? `${remaining} left` : "∞ stock"}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-white/30 px-3">No stock limit (Loss)</span>
                      )}

                      {/* Loss Checkbox */}
                      <label className="flex items-center gap-1.5 cursor-pointer px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <input type="checkbox" checked={!!prize.isLosing} onChange={e => handleUpdatePrize(idx, "isLosing", e.target.checked)} className="w-3.5 h-3.5 accent-red-500 cursor-pointer" />
                        <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Loss</span>
                      </label>

                      {/* Delete */}
                      <button onClick={() => handleDeletePrize(idx)} className="p-2 rounded-lg transition-colors hover:text-red-400" style={{ color: "rgba(255,255,255,0.2)" }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Stores & Brand Ambassadors Tab ── */}
        {activeTab === "stores" && (
          <div className="space-y-6">
            {/* Live feedback toast */}
            {storeToast && (
              <div className="p-3.5 rounded-xl bg-teal-500/15 border border-teal-500/40 text-teal-300 text-xs font-bold flex items-center justify-between animate-fadeIn">
                <span>{storeToast}</span>
                <button onClick={() => setStoreToast(null)} className="text-white/40 hover:text-white">✕</button>
              </div>
            )}

            {/* Create Store Account Card */}
            <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="border-b border-white/10 pb-3">
                <h3 className="font-black text-white text-sm flex items-center gap-2" style={{ fontFamily: "Rubik, sans-serif" }}>
                  <Store className="w-4 h-4 text-teal-400" />
                  Add Store / Brand Ambassador Account
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Create dedicated accounts for retail stores, activation leads, or BAs. Each account generates a distinct TV link & QR code for attendee tracking.
                </p>
              </div>

              <form onSubmit={handleAddStore} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>Store / BA Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Shoprite Ikeja"
                    value={newStoreName}
                    onChange={e => setNewStoreName(e.target.value)}
                    required
                    className="w-full rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>Unique Code</label>
                  <input
                    type="text"
                    placeholder="e.g. shoprite-ikeja"
                    value={newStoreCode}
                    onChange={e => setNewStoreCode(e.target.value)}
                    className="w-full rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>City / Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Lagos"
                    value={newStoreCity}
                    onChange={e => setNewStoreCity(e.target.value)}
                    className="w-full rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>Access PIN</label>
                  <input
                    type="text"
                    placeholder="1234"
                    value={newStorePin}
                    onChange={e => setNewStorePin(e.target.value)}
                    className="w-full rounded-xl px-3.5 py-2.5 text-xs text-white font-mono text-center outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!newStoreName.trim() || storeSaving}
                  className="w-full py-2.5 rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 transition-all hover:opacity-90 disabled:opacity-40 shadow-md cursor-pointer"
                  style={{ background: "linear-gradient(135deg, #00BFA6, #0D9488)", fontFamily: "Rubik, sans-serif" }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {storeSaving ? "Saving Live…" : "Add Store Account"}
                </button>
              </form>
            </div>

            {/* Store Directory Grid */}
            <div className="rounded-2xl p-6 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between">
                <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Active Stores & Brand Ambassadors ({(campaign.stores || []).length})
                </h3>
                <span className="text-xs text-white/40 font-semibold">Real-time Activation Performance</span>
              </div>

              {!campaign.stores?.length ? (
                <div className="text-center py-12 space-y-2">
                  <p className="text-3xl">🏪</p>
                  <p className="text-sm font-bold text-white">No store or BA accounts created yet.</p>
                  <p className="text-xs text-white/40">Use the form above to add retail locations or Brand Ambassadors.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {campaign.stores.map((s) => {
                    const storeSpins = participants.filter(p =>
                      (p.storeCode && s.code && p.storeCode.toLowerCase() === s.code.toLowerCase()) ||
                      p.storeCode === s.id ||
                      (p.storeName && s.name && p.storeName.toLowerCase() === s.name.toLowerCase())
                    );
                    const storeWinners = storeSpins.filter(p => p.won).length;
                    const storeWinRate = storeSpins.length ? Math.round((storeWinners / storeSpins.length) * 100) : 0;
                    const storeTvUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/tv?c=${campaignSlug}&store=${s.code}`;
                    const storeWheelUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/?c=${campaignSlug}&store=${s.code}`;

                    return (
                      <div key={s.id || s.code} className="rounded-2xl p-5 space-y-4 bg-white/[0.03] border border-white/10 relative group hover:border-teal-500/40 transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 flex-shrink-0">
                              <MapPin className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-black text-white text-base truncate leading-tight" style={{ fontFamily: "Rubik, sans-serif" }}>
                                {s.name}
                              </h4>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                <span className="text-[11px] font-mono text-teal-400">
                                  {s.code}
                                </span>
                                {s.city && (
                                  <span className="text-[10px] text-white/50">· {s.city}</span>
                                )}
                                {s.pin && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-white/10 text-white/80 border border-white/10">
                                    PIN: {s.pin}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button onClick={() => handleDeleteStore(s.id)} className="p-1.5 rounded-lg opacity-40 hover:opacity-100 hover:text-red-400 transition-all cursor-pointer flex-shrink-0" title="Delete Store">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-black/40 border border-white/5 text-center">
                          <div>
                            <p className="text-base font-black font-mono text-white">{storeSpins.length}</p>
                            <p className="text-[9px] uppercase font-bold text-white/40">Spins</p>
                          </div>
                          <div>
                            <p className="text-base font-black font-mono text-emerald-400">{storeWinners}</p>
                            <p className="text-[9px] uppercase font-bold text-white/40">Winners</p>
                          </div>
                          <div>
                            <p className="text-base font-black font-mono text-orange-400">{storeWinRate}%</p>
                            <p className="text-[9px] uppercase font-bold text-white/40">Win Rate</p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(storeWheelUrl);
                              setStoreToast(`📋 Copied attendee link for ${s.name}!`);
                              setTimeout(() => setStoreToast(null), 2500);
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all cursor-pointer"
                            title="Copy Attendee Link"
                          >
                            <Copy className="w-3.5 h-3.5 text-white/60" />
                            <span className="truncate">Copy Link</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedStoreForQr(s);
                              setShowQrModal(true);
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all cursor-pointer"
                          >
                            <QrCode className="w-3.5 h-3.5 text-teal-400" />
                            <span className="truncate">QR Code</span>
                          </button>

                          <Link
                            href={`/tv?c=${campaignSlug}&store=${s.code}`}
                            target="_blank"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-black text-white transition-all hover:opacity-90 shadow-sm"
                            style={{ background: "linear-gradient(135deg, #00BFA6, #0D9488)" }}
                          >
                            <Tv className="w-3.5 h-3.5" />
                            <span className="truncate">Launch TV</span>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Participants Tab ── */}
        {activeTab === "export" && (
          <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Participant Registrations · {participants.length}</h3>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Real-time activation entries with store & BA attribution — export to CSV.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {campaign.stores && campaign.stores.length > 0 && (
                  <select
                    value={storeFilter}
                    onChange={e => setStoreFilter(e.target.value)}
                    className="rounded-xl px-3 py-2 text-xs text-white bg-black/40 border border-white/10 outline-none font-bold"
                  >
                    <option value="all" className="bg-slate-900">All Locations / BAs</option>
                    {campaign.stores.map((s) => (
                      <option key={s.id || s.code} value={s.code} className="bg-slate-900">
                        📍 {s.name}
                      </option>
                    ))}
                  </select>
                )}
                <input type="text" placeholder="Search name/phone…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="rounded-xl px-4 py-2 text-xs text-white outline-none w-44"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                <button onClick={exportToCSV} disabled={!participants.length}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50 hover:opacity-90 transition-all"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ fontSize: "12px" }}>
                <thead>
                  <tr>
                    {["Name", "Phone", "Email", "Prize", "Voucher", "Store / BA", "Date & Time"].map(h => (
                      <th key={h} className="pb-3 px-2 font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.25)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>No records found.</td></tr>
                  ) : filtered.filter(p => storeFilter === "all" || p.storeCode === storeFilter || p.storeCode === campaign.stores?.find(s=>s.code===storeFilter)?.id).map((p, i) => (
                    <tr key={p.id || i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td className="py-3 px-2 font-bold text-white">{p.name}</td>
                      <td className="py-3 px-2 font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>{p.phone}</td>
                      <td className="py-3 px-2" style={{ color: "rgba(255,255,255,0.4)" }}>{p.email || "—"}</td>
                      <td className="py-3 px-2">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: p.won ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)", color: p.won ? "#10b981" : "rgba(255,255,255,0.35)", border: `1px solid ${p.won ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.06)"}` }}>
                          {p.prizeLabel}
                        </span>
                      </td>
                      <td className="py-3 px-2 font-mono" style={{ color: "#00BFA6" }}>{p.voucherCode || "—"}</td>
                      <td className="py-3 px-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-white/5 border border-white/10 text-teal-300">
                          {p.storeName || p.storeCode || "General Stage"}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <div className="text-white text-xs font-semibold whitespace-nowrap">
                          {new Date(p.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </div>
                        <div className="text-[10px] font-mono whitespace-nowrap" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Lucky Draw Tab ── */}
        {activeTab === "luckydraw" && (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="rounded-3xl p-10 text-center space-y-8 w-full max-w-lg" style={{
              background: "radial-gradient(circle at 50% 30%, rgba(167,139,250,0.1), transparent 70%), rgba(255,255,255,0.03)",
              border: "1px solid rgba(167,139,250,0.15)",
            }}>
              <div className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto shadow-2xl" style={{ background: "linear-gradient(135deg, rgba(167,139,250,0.3), rgba(139,92,246,0.3))", border: "1px solid rgba(167,139,250,0.3)" }}>
                <Dices className="w-12 h-12" style={{ color: "#a78bfa" }} />
              </div>
              <div>
                <h3 className="text-3xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>Live Lucky Draw</h3>
                <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>Randomly selects a grand prize winner from all participants.</p>
              </div>
              {luckyWinner && (
                <div className="rounded-2xl p-6 space-y-2" style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)" }}>
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: "#a78bfa" }}>🎉 Grand Winner!</p>
                  <h2 className="text-4xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>{luckyWinner.name}</h2>
                  <p className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>{luckyWinner.phone}</p>
                </div>
              )}
              <button onClick={triggerLuckyDraw} disabled={isDrawing || !participants.length}
                className="w-full py-4 rounded-2xl font-black text-white text-base disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 8px 24px rgba(124,58,237,0.4)", fontFamily: "Rubik, sans-serif" }}>
                {isDrawing ? "🎲 Drawing…" : "🎰 Run Lucky Draw!"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── QR Modal ── */}
      {showQrModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }} onClick={() => { setShowQrModal(false); setSelectedStoreForQr(null); }}>
          <div className="rounded-3xl p-8 max-w-sm w-full text-center space-y-5" style={{ background: "#0f1823", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                {selectedStoreForQr ? selectedStoreForQr.name : "Scan to Spin"}
              </h3>
              {selectedStoreForQr && (
                <p className="text-xs font-mono text-teal-400 mt-1">
                  Store Tracking Code: {selectedStoreForQr.code}
                </p>
              )}
            </div>
            <div className="bg-white p-5 rounded-2xl mx-auto w-fit shadow-inner">
              <QRCodeSVG
                value={
                  selectedStoreForQr
                    ? `${typeof window !== "undefined" ? window.location.origin : ""}/?c=${campaignSlug}&store=${selectedStoreForQr.code}`
                    : qrUrl
                }
                size={200}
              />
            </div>
            <p className="text-xs font-mono break-all text-white/30">
              {selectedStoreForQr
                ? `${typeof window !== "undefined" ? window.location.origin : ""}/?c=${campaignSlug}&store=${selectedStoreForQr.code}`
                : qrUrl}
            </p>
            <button
              onClick={() => { setShowQrModal(false); setSelectedStoreForQr(null); }}
              className="w-full py-3 rounded-xl text-xs font-bold text-white/60 hover:text-white bg-white/5 border border-white/10"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Clear Database Security Modal ── */}
      {showClearModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(14px)" }}
          onClick={() => { setShowClearModal(false); setClearError(""); }}
        >
          <div
            className="rounded-3xl p-7 max-w-md w-full text-center space-y-5 bg-[#0f1823] border border-red-500/30 shadow-2xl animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-red-400 bg-red-950/40 border border-red-500/40 text-2xl shadow-inner">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                Confirm Database Reset
              </h3>
              <p className="text-xs text-white/50 mt-1.5 leading-relaxed">
                This will permanently delete all participant registration & spin records and reset claimed stock counts in Firestore for <span className="font-bold text-white">"{campaign.name}"</span>.
              </p>
            </div>

            <form onSubmit={handleConfirmClearDatabase} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-white/60 mb-1.5 uppercase tracking-wider">
                  Enter Admin Password to Authorize *
                </label>
                <input
                  type="password"
                  value={clearPasswordInput}
                  onChange={e => {
                    setClearPasswordInput(e.target.value);
                    setClearError("");
                  }}
                  placeholder="Admin password"
                  required
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 bg-black/50 border border-white/15 text-white text-sm outline-none focus:border-red-500 transition-all font-mono"
                />
                {clearError && (
                  <p className="text-xs text-red-400 font-bold mt-2 flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{clearError}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowClearModal(false); setClearError(""); }}
                  className="flex-1 py-3 rounded-xl text-xs font-bold text-white/60 hover:text-white bg-white/5 border border-white/10 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={clearing || !clearPasswordInput}
                  className="flex-1 py-3 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-all shadow-lg shadow-red-950 cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ fontFamily: "Rubik, sans-serif" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{clearing ? "Wiping Data…" : "Wipe Campaign Data"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
