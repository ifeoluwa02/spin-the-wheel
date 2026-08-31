"use client";

import { useEffect, useState } from "react";
import type { Campaign, Participant, SuperAdminConfig, CampaignAdmin } from "@/types";
import {
  getAllCampaigns,
  getAllGlobalParticipants,
  updateCampaign,
  clearCampaignData,
  getSuperAdminConfig,
  setSuperAdminConfig,
  getAllCampaignAdmins,
} from "@/lib/campaign";
import Link from "next/link";
import {
  Shield, LogOut, BarChart3, Globe, Plus, Download,
  Tv, ExternalLink, Settings, Activity, Trophy, Users,
  Power, ChevronRight, X, Check, Layers, RefreshCw, Database,
  AlertTriangle, Trash2, UserPlus, UsersRound, Key, Mail, Eye, EyeOff,
} from "lucide-react";

export default function SuperAdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  // Login form state
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  // First-run setup state
  const [configLoaded, setConfigLoaded] = useState(false);
  const [hasConfig, setHasConfig] = useState<boolean | null>(null);
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [setupError, setSetupError] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Admin Management Modal State
  const [selectedCampaignForAdmins, setSelectedCampaignForAdmins] = useState<Campaign | null>(null);
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [showNewAdminPass, setShowNewAdminPass] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminModalMsg, setAdminModalMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteAdminLoading, setDeleteAdminLoading] = useState<string | null>(null);

  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipePasswordInput, setWipePasswordInput] = useState("");
  const [wipeError, setWipeError] = useState("");
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    // Check if already authenticated in session
    if (typeof window !== "undefined" && sessionStorage.getItem("super_admin_authed") === "true") {
      setAuthenticated(true);
    }
    // Always check if a Super Admin account has been configured
    getSuperAdminConfig().then(cfg => {
      setHasConfig(!!cfg);
      setConfigLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadData();
    }
  }, [authenticated]);

  async function loadData() {
    setLoading(true);
    try {
      const [allC, allP] = await Promise.all([
        getAllCampaigns(),
        getAllGlobalParticipants(),
      ]);
      setCampaigns(allC);
      setAllParticipants(allP);
    } catch (err) {
      console.error("Failed to load super admin data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  function handleOpenWipeModal() {
    setWipePasswordInput("");
    setWipeError("");
    setShowWipeModal(true);
  }

  async function handleConfirmWipeAllDatabase(e: React.FormEvent) {
    e.preventDefault();
    setWipeError("");
    setWiping(true);
    try {
      const cfg = await getSuperAdminConfig();
      if (!cfg || wipePasswordInput !== cfg.password) {
        setWipeError("Incorrect Super Admin password. Global wipe denied.");
        setWiping(false);
        return;
      }

      const res = await clearCampaignData();
      await loadData();
      setShowWipeModal(false);
      setWipePasswordInput("");
      alert(`✅ System database wiped! Cleared ${res.deletedCount} participant record(s) from Firestore.`);
    } catch (err) {
      setWipeError("Failed to wipe database. Check Firestore permissions.");
    } finally {
      setWiping(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const cfg = await getSuperAdminConfig();
      if (cfg && emailInput.trim().toLowerCase() === cfg.email.toLowerCase() && passwordInput === cfg.password) {
        setAuthenticated(true);
        sessionStorage.setItem("super_admin_authed", "true");
      } else {
        setLoginError("Incorrect email or password.");
      }
    } catch (err) {
      setLoginError("Login failed. Check your Firebase connection.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleFirstRunSetup(e: React.FormEvent) {
    e.preventDefault();
    if (setupPassword !== setupConfirm) { setSetupError("Passwords do not match."); return; }
    if (setupPassword.length < 8) { setSetupError("Password must be at least 8 characters."); return; }
    setSetupLoading(true);
    setSetupError("");
    try {
      await setSuperAdminConfig({ email: setupEmail.trim().toLowerCase(), password: setupPassword });
      setHasConfig(true);
      setLoginError("");
    } catch (err) {
      setSetupError("Failed to create account. Check Firestore permissions.");
    } finally {
      setSetupLoading(false);
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

  function handleOpenAdminsModal(c: Campaign) {
    setSelectedCampaignForAdmins(c);
    setNewAdminName("");
    setNewAdminEmail("");
    setNewAdminPassword("");
    setAdminModalMsg(null);
  }

  async function handleAddAdminToCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCampaignForAdmins) return;
    if (!newAdminEmail.trim() || !newAdminPassword.trim()) {
      setAdminModalMsg({ type: "error", text: "Email and password are required." });
      return;
    }

    setAdminSaving(true);
    setAdminModalMsg(null);

    const newAdmin: CampaignAdmin = {
      id: `admin-${Date.now()}`,
      name: newAdminName.trim() || undefined,
      email: newAdminEmail.trim().toLowerCase(),
      password: newAdminPassword.trim(),
      createdAt: Date.now(),
    };

    const currentAdmins = selectedCampaignForAdmins.admins || [];
    // Check if email already exists
    const allAdmins = getAllCampaignAdmins(selectedCampaignForAdmins);
    if (allAdmins.some(a => a.email.toLowerCase() === newAdmin.email.toLowerCase())) {
      setAdminModalMsg({ type: "error", text: "An admin with this email already exists on this campaign." });
      setAdminSaving(false);
      return;
    }

    const updatedCampaign: Campaign = {
      ...selectedCampaignForAdmins,
      admins: [...currentAdmins, newAdmin],
    };

    try {
      await updateCampaign(updatedCampaign);
      setSelectedCampaignForAdmins(updatedCampaign);
      setCampaigns(prev => prev.map(c => c.id === updatedCampaign.id ? updatedCampaign : c));
      setNewAdminName("");
      setNewAdminEmail("");
      setNewAdminPassword("");
      setAdminModalMsg({ type: "success", text: `✅ Admin account created for ${newAdmin.email}` });
    } catch (err) {
      console.error("Failed to add admin:", err);
      setAdminModalMsg({ type: "error", text: "Failed to save admin. Check connection." });
    } finally {
      setAdminSaving(false);
    }
  }

  async function handleRemoveAdminFromCampaign(adminId: string) {
    if (!selectedCampaignForAdmins) return;
    if (!window.confirm("Are you sure you want to remove this admin? They will lose access immediately.")) return;

    setDeleteAdminLoading(adminId);
    setAdminModalMsg(null);

    let updatedCampaign: Campaign;
    if (adminId === "primary-admin") {
      // If removing legacy primary admin
      updatedCampaign = {
        ...selectedCampaignForAdmins,
        adminEmail: undefined,
        adminPassword: undefined,
      };
    } else {
      updatedCampaign = {
        ...selectedCampaignForAdmins,
        admins: (selectedCampaignForAdmins.admins || []).filter(a => a.id !== adminId),
      };
    }

    try {
      await updateCampaign(updatedCampaign);
      setSelectedCampaignForAdmins(updatedCampaign);
      setCampaigns(prev => prev.map(c => c.id === updatedCampaign.id ? updatedCampaign : c));
      setAdminModalMsg({ type: "success", text: "Admin removed successfully." });
    } catch (err) {
      console.error("Failed to remove admin:", err);
      setAdminModalMsg({ type: "error", text: "Failed to remove admin. Check connection." });
    } finally {
      setDeleteAdminLoading(null);
    }
  }

  function exportAll() {
    const headers = ["Campaign", "Name", "Phone", "Age Range", "Gender", "Email", "Prize Won", "Voucher Code", "Status", "Store / BA", "Store Code", "Date & Time"];
    const rows = allParticipants.map(p => [
      `"${p.campaignId}"`,
      `"${p.name}"`,
      `"${p.phone}"`,
      `"${p.ageRange || "—"}"`,
      `"${p.gender || "—"}"`,
      `"${p.email || ""}"`,
      `"${p.prizeLabel}"`,
      `"${p.voucherCode || ""}"`,
      p.won ? "Winner" : "Non-Winner",
      `"${p.storeName || "General Stage"}"`,
      `"${p.storeCode || ""}"`,
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

  // Show spinner while checking Firestore config
  if (!configLoaded || (loading && authenticated)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d14]">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // ─── FIRST-RUN SETUP ────────────────────────────────────────────────────────
  if (!hasConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{
        background: "radial-gradient(ellipse at 50% 30%, rgba(245,158,11,0.18) 0%, transparent 60%), #070d14",
        fontFamily: "Nunito, sans-serif",
      }}>
        <form onSubmit={handleFirstRunSetup} className="w-full max-w-md">
          <div className="rounded-3xl p-8 space-y-6" style={{
            background: "rgba(255,255,255,0.03)", backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
          }}>
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Create Master Account</h2>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>First-time setup — create your Super Admin credentials. Store these safely.</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Master Email</label>
                <input type="email" value={setupEmail} onChange={e => setSetupEmail(e.target.value)} placeholder="master@agency.com" required
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)" }} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Master Password</label>
                <input type="password" value={setupPassword} onChange={e => setSetupPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8}
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)" }} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Confirm Password</label>
                <input type="password" value={setupConfirm} onChange={e => setSetupConfirm(e.target.value)} placeholder="Repeat password" required
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)" }} />
              </div>
              {setupError && <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400"><X className="w-3.5 h-3.5" /> {setupError}</p>}
            </div>

            <button type="submit" disabled={setupLoading}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", boxShadow: "0 8px 24px rgba(245,158,11,0.35)", fontFamily: "Rubik, sans-serif" }}>
              {setupLoading ? "Creating Account..." : "Create Master Account"}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ─── LOGIN SCREEN ───────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{
        background: "radial-gradient(ellipse at 50% 30%, rgba(245,158,11,0.15) 0%, transparent 60%), #070d14",
        fontFamily: "Nunito, sans-serif",
      }}>
        <form onSubmit={handleLogin} className="w-full max-w-md">
          <div className="rounded-3xl p-8 space-y-6" style={{
            background: "rgba(255,255,255,0.03)", backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
          }}>
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-xl" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Super Admin Portal</h2>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Master agency access — view all campaigns &amp; global logs.</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Email</label>
                <input type="email" value={emailInput} onChange={e => { setEmailInput(e.target.value); setLoginError(""); }} placeholder="master@agency.com" required autoComplete="email"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: loginError ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(255,255,255,0.1)" }} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Password</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={passwordInput} onChange={e => { setPasswordInput(e.target.value); setLoginError(""); }} placeholder="••••••••" required autoComplete="current-password"
                    className="w-full rounded-xl px-4 py-3 pr-12 text-sm text-white outline-none transition-all"
                    style={{ background: "rgba(255,255,255,0.06)", border: loginError ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(255,255,255,0.1)" }} />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold transition-colors"
                    style={{ color: "rgba(255,255,255,0.35)" }}>
                    {showPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>
              </div>
              {loginError && <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400"><X className="w-3.5 h-3.5" /> {loginError}</p>}
            </div>

            <button type="submit" disabled={loginLoading}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 group transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", boxShadow: "0 8px 24px rgba(245,158,11,0.35)", fontFamily: "Rubik, sans-serif" }}>
              {loginLoading ? "Verifying..." : <>Access Master Portal <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>}
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
            <button
              onClick={handleOpenWipeModal}
              disabled={wiping}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-950/30 border border-red-500/30 hover:bg-red-900/40 transition-all cursor-pointer"
              title="Wipe all system participants from Firestore (Super Admin Password Required)"
            >
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
                    {["Brand", "Slug", "Prizes", "Admins", "Status", "Actions"].map(h => (
                      <th key={h} className="px-6 py-3 text-left font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.25)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c, i) => {
                    const slug = c.id || "";
                    const spins = allParticipants.filter(p => p.campaignId === slug).length;
                    const adminList = getAllCampaignAdmins(c);
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
                          <button
                            onClick={() => handleOpenAdminsModal(c)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all hover:scale-105 cursor-pointer"
                            style={{
                              background: adminList.length > 0 ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)",
                              color: adminList.length > 0 ? "#f59e0b" : "rgba(255,255,255,0.4)",
                              border: `1px solid ${adminList.length > 0 ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.08)"}`,
                            }}
                            title="Manage Campaign Admins"
                          >
                            <UsersRound className="w-3.5 h-3.5" />
                            <span>{adminList.length} Admin{adminList.length !== 1 ? "s" : ""}</span>
                            <Plus className="w-2.5 h-2.5 opacity-60" />
                          </button>
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

      {/* ── Super Admin Wipe DB Security Modal ── */}
      {showWipeModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(14px)" }}
          onClick={() => { setShowWipeModal(false); setWipeError(""); }}
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
                Global Database Wipe
              </h3>
              <p className="text-xs text-white/50 mt-1.5 leading-relaxed">
                ⚠️ DANGER: This will permanently delete <span className="text-red-400 font-bold">ALL participant registration records</span> and reset claimed prize stock across <span className="font-bold text-white">ALL campaigns</span> in the entire system.
              </p>
            </div>

            <form onSubmit={handleConfirmWipeAllDatabase} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-white/60 mb-1.5 uppercase tracking-wider">
                  Enter Super Admin Password to Authorize *
                </label>
                <input
                  type="password"
                  value={wipePasswordInput}
                  onChange={e => {
                    setWipePasswordInput(e.target.value);
                    setWipeError("");
                  }}
                  placeholder="Super Admin master password"
                  required
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 bg-black/50 border border-white/15 text-white text-sm outline-none focus:border-red-500 transition-all font-mono"
                />
                {wipeError && (
                  <p className="text-xs text-red-400 font-bold mt-2 flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{wipeError}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowWipeModal(false); setWipeError(""); }}
                  className="flex-1 py-3 rounded-xl text-xs font-bold text-white/60 hover:text-white bg-white/5 border border-white/10 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={wiping || !wipePasswordInput}
                  className="flex-1 py-3 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-all shadow-lg shadow-red-950 cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ fontFamily: "Rubik, sans-serif" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{wiping ? "Wiping System…" : "Wipe All System Data"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Manage Campaign Admins Modal ── */}
      {selectedCampaignForAdmins && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(14px)" }}
          onClick={() => { setSelectedCampaignForAdmins(null); setAdminModalMsg(null); }}
        >
          <div
            className="rounded-3xl p-6 sm:p-7 max-w-lg w-full space-y-5 bg-[#0f1823] border border-amber-500/30 shadow-2xl animate-fadeIn max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-amber-400 bg-amber-950/40 border border-amber-500/30 flex-shrink-0">
                  <UsersRound className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                    Manage Campaign Admins
                  </h3>
                  <p className="text-xs text-white/50 truncate">
                    {selectedCampaignForAdmins.name} <span className="font-mono text-teal-400">/{selectedCampaignForAdmins.id}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedCampaignForAdmins(null); setAdminModalMsg(null); }}
                className="p-1.5 rounded-lg text-white/40 hover:text-white bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status Messages */}
            {adminModalMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-bold ${
                  adminModalMsg.type === "success"
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                    : "bg-red-500/15 border border-red-500/30 text-red-300"
                }`}
              >
                {adminModalMsg.text}
              </div>
            )}

            {/* Current Admins List */}
            <div className="space-y-2.5">
              <label className="block text-[11px] font-bold text-white/60 uppercase tracking-wider">
                Assigned Admins ({getAllCampaignAdmins(selectedCampaignForAdmins).length})
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {getAllCampaignAdmins(selectedCampaignForAdmins).map((admin) => (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-black text-white truncate">
                          {admin.name || "Campaign Admin"}
                        </p>
                        {admin.id === "primary-admin" && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase">
                            Primary
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-white/40 truncate">{admin.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRemoveAdminFromCampaign(admin.id)}
                        disabled={deleteAdminLoading === admin.id}
                        className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                        title="Remove admin"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add New Admin Form */}
            <form onSubmit={handleAddAdminToCampaign} className="space-y-3 pt-3 border-t border-white/10">
              <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                Add Another Admin / Project Manager
              </h4>

              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1">
                  Admin Name (Optional)
                </label>
                <input
                  type="text"
                  value={newAdminName}
                  onChange={e => setNewAdminName(e.target.value)}
                  placeholder="e.g. Ade Johnson"
                  className="w-full rounded-xl px-3.5 py-2.5 bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-amber-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1">
                  Login Email *
                </label>
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={e => setNewAdminEmail(e.target.value)}
                  placeholder="pm@brand.com"
                  required
                  className="w-full rounded-xl px-3.5 py-2.5 bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-amber-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1">
                  Login Password *
                </label>
                <div className="relative">
                  <input
                    type={showNewAdminPass ? "text" : "password"}
                    value={newAdminPassword}
                    onChange={e => setNewAdminPassword(e.target.value)}
                    placeholder="Set a password (min. 6 chars)"
                    required
                    className="w-full rounded-xl px-3.5 py-2.5 pr-10 bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-amber-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewAdminPass(!showNewAdminPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    {showNewAdminPass ? <EyeOff className="w-3.5 h-3.5 text-white" /> : <Eye className="w-3.5 h-3.5 text-white" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={adminSaving || !newAdminEmail.trim() || !newAdminPassword.trim()}
                className="w-full py-2.5 rounded-xl text-xs font-black text-black bg-amber-500 hover:bg-amber-400 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-amber-950/40 cursor-pointer"
                style={{ fontFamily: "Rubik, sans-serif" }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{adminSaving ? "Adding Admin…" : "Add Admin Account"}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
