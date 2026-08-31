"use client";

import { useState, useEffect } from "react";
import type { Campaign, Prize } from "@/types";
import { updateCampaign, getSuperAdminConfig } from "@/lib/campaign";
import { getGradientContrastColor, isLightColor } from "@/lib/colors";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  ArrowLeft,
  Rocket,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
  Building2,
  Palette,
  Trophy,
  Zap,
  Check,
  Lock,
  ShieldAlert,
  ChevronRight,
  X,
} from "lucide-react";

const STEPS = [
  { id: 1, label: "Brand Info", icon: Building2, desc: "Campaign identity" },
  { id: 2, label: "Visual Style", icon: Palette, desc: "Colors & gradients" },
  { id: 3, label: "Prizes", icon: Trophy, desc: "Wheel segments" },
  { id: 4, label: "Launch", icon: Zap, desc: "Copy your links" },
];

export default function CreateCampaignWizard() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [brandName, setBrandName] = useState("");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [subTitle, setSubTitle] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [campaignSlug, setCampaignSlug] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("Spin the wheel for a chance to win instant rewards!");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [additionalAdmins, setAdditionalAdmins] = useState<{ id: string; name: string; email: string; password: string }[]>([]);
  const [oneSpinPerPhone, setOneSpinPerPhone] = useState(true);

  const [primaryColor, setPrimaryColor] = useState("#00BFA6");
  const [secondaryColor, setSecondaryColor] = useState("#FF6B35");
  const [gradientStart, setGradientStart] = useState("#FF6B35");
  const [gradientEnd, setGradientEnd] = useState("#00BFA6");
  const [backgroundColor, setBackgroundColor] = useState("#070d14");

  const [prizes, setPrizes] = useState<Prize[]>([
    { id: "1", label: "Umbrella", color: "#00BFA6", weight: 2 },
    { id: "2", label: "T-shirt", color: "#FF6B35", weight: 5 },
    { id: "3", label: "Hand Sanitizer", color: "#00BFA6", weight: 20 },
    { id: "4", label: "Face Cap", color: "#FF6B35", weight: 10 },
    { id: "5", label: "Try Again", color: "#0D1B2A", weight: 60, isLosing: true },
    { id: "6", label: "Water Bottle", color: "#00BFA6", weight: 3 },
  ]);

  const [saving, setSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  // Super Admin gate state
  const [authenticated, setAuthenticated] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
      if (sessionStorage.getItem("super_admin_authed") === "true") {
        setAuthenticated(true);
        setConfigLoaded(true);
        return;
      }
      getSuperAdminConfig().then(cfg => {
        setConfigLoaded(true);
        if (!cfg) {
          // No config yet — redirect to super-admin for first-run setup
          window.location.href = "/super-admin";
        }
      });
    }
  }, []);

  async function handleAuthLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const cfg = await getSuperAdminConfig();
      if (cfg && authEmail.trim().toLowerCase() === cfg.email.toLowerCase() && authPassword === cfg.password) {
        setAuthenticated(true);
        sessionStorage.setItem("super_admin_authed", "true");
      } else {
        setAuthError("Incorrect email or password.");
      }
    } catch (err) {
      setAuthError("Login failed. Check your Firebase connection.");
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    if (campaignTitle && !slugEdited) {
      const generated = campaignTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
      setCampaignSlug(generated);
    }
  }, [campaignTitle, slugEdited]);

  // ── SUPER ADMIN LOGIN GATE ──
  if (!configLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d14]">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#070d14] text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
        <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "#FF6B35" }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "#00BFA6" }} />

        <form onSubmit={handleAuthLogin} className="relative w-full max-w-md">
          <div className="rounded-3xl p-8 space-y-6 bg-white/[0.04] backdrop-blur-2xl border border-white/10 shadow-2xl">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl" style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}>
                <ShieldAlert className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Super Admin Access</h2>
                <p className="text-xs text-amber-400 font-bold uppercase tracking-wider mt-1">Master Portal Authorization Required</p>
                <p className="text-xs text-white/50 mt-1">Only authorized Super Admins can create new campaigns.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-white/50">Email</label>
                <input type="email" value={authEmail} onChange={e => { setAuthEmail(e.target.value); setAuthError(""); }} placeholder="master@agency.com" required autoComplete="email"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none bg-black/40 border border-white/10 focus:border-amber-500 transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-white/50">Password</label>
                <div className="relative">
                  <input type={showAuthPassword ? "text" : "password"} value={authPassword} onChange={e => { setAuthPassword(e.target.value); setAuthError(""); }} placeholder="••••••••" required autoComplete="current-password"
                    className="w-full rounded-xl px-4 py-3 pr-12 text-sm text-white outline-none bg-black/40 border border-white/10 focus:border-amber-500 transition-all" />
                  <button type="button" onClick={() => setShowAuthPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white/40 hover:text-white/70">
                    {showAuthPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>
              </div>
              {authError && <p className="flex items-center gap-1 text-xs font-bold text-red-400"><X className="w-3.5 h-3.5" /> {authError}</p>}
            </div>

            <button type="submit" disabled={authLoading}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] shadow-lg disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", fontFamily: "Rubik, sans-serif" }}>
              {authLoading ? "Verifying..." : <><span>Unlock Campaign Creator</span><ChevronRight className="w-4 h-4" /></>}
            </button>

            <div className="flex items-center justify-center gap-4 text-xs font-semibold text-white/40">
              <Link href="/super-admin" className="hover:text-white transition-colors">Master Admin Portal →</Link>
            </div>
          </div>
        </form>
      </div>
    );
  }

  function handleUpdatePrize(index: number, field: keyof Prize, value: any) {
    const updated = [...prizes];
    updated[index] = { ...updated[index], [field]: value };
    setPrizes(updated);
  }

  function handleAddPrize() {
    setPrizes([...prizes, { id: `prize-${Date.now()}`, label: "New Reward", color: "#00BFA6", weight: 10, isLosing: false }]);
  }

  function handleDeletePrize(index: number) {
    setPrizes(prizes.filter((_, i) => i !== index));
  }

  async function handleLaunchCampaign() {
    if (!adminEmail.trim() || !adminPassword.trim()) {
      alert("Please set an Admin Email and Password before launching.");
      return;
    }
    setSaving(true);
    const finalSlug = campaignSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || `campaign-${Date.now()}`;
    const validAdmins = additionalAdmins
      .filter(a => a.email.trim() && a.password.trim())
      .map(a => ({
        id: a.id || `admin-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: a.name.trim() || undefined,
        email: a.email.trim().toLowerCase(),
        password: a.password.trim(),
        createdAt: Date.now(),
      }));

    const newCampaign: Campaign = {
      id: finalSlug,
      name: campaignTitle || "Brand Experiential Activation",
      subTitle: subTitle || brandName,
      logoUrl: logoUrl || undefined,
      primaryColor,
      secondaryColor,
      backgroundColor: backgroundColor || "#070d14",
      gradientStart,
      gradientEnd,
      welcomeMessage,
      oneSpinPerPhone,
      active: true,
      adminEmail: adminEmail.trim().toLowerCase(),
      adminPassword: adminPassword.trim(),
      admins: validAdmins.length ? validAdmins : undefined,
      prizes,
    };
    await updateCampaign(newCampaign);
    setSaving(false);
    setStep(4);
  }

  function handleCopy(text: string, type: string) {
    navigator.clipboard.writeText(text);
    setCopiedLink(type);
    setTimeout(() => setCopiedLink(null), 2000);
  }

  const activeSlug = campaignSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const wheelUrl = `${baseUrl}/?c=${activeSlug}`;
  const adminUrl = `${baseUrl}/admin?c=${activeSlug}`;
  const tvUrl = `${baseUrl}/tv?c=${activeSlug}`;
  const totalWeight = prizes.reduce((sum, p) => sum + Math.max(p.weight, 0), 0);

  const inputStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "white",
    outline: "none",
    transition: "border-color 0.2s",
  };

  return (
    <div
      className="min-h-screen font-sans pb-20 relative overflow-hidden"
      style={{ background: "#070d14", fontFamily: "Nunito, sans-serif" }}
    >
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-3xl opacity-10" style={{ background: "radial-gradient(circle, #00BFA6, transparent)" }} />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-3xl opacity-10" style={{ background: "radial-gradient(circle, #FF6B35, transparent)" }} />
      </div>

      {/* Header */}
      <header
        className="relative z-10 px-4 py-3.5"
        style={{
          background: "rgba(7,13,20,0.85)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm" style={{ background: "linear-gradient(135deg, #FF6B35, #00BFA6)" }}>
              🚀
            </div>
            <div>
              <p className="font-black text-white text-sm leading-tight" style={{ fontFamily: "Rubik, sans-serif" }}>
                Campaign Builder
              </p>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>Create a hosted spin-the-wheel activation</p>
            </div>
          </div>
          <Link href="/admin" className="text-xs font-bold transition-colors hover:text-white" style={{ color: "rgba(255,255,255,0.3)" }}>
            ← Admin Portal
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-4 pt-8">
        {/* Step indicator */}
        {step !== 4 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done = step > s.id;
                const active = step === s.id;
                return (
                  <div key={s.id} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                        style={{
                          background: done ? "linear-gradient(135deg, #00BFA6, #0D9488)" : active ? "linear-gradient(135deg, rgba(255,107,53,0.3), rgba(0,191,166,0.3))" : "rgba(255,255,255,0.04)",
                          border: active ? "1px solid rgba(255,255,255,0.15)" : done ? "1px solid rgba(0,191,166,0.4)" : "1px solid rgba(255,255,255,0.06)",
                          boxShadow: active ? "0 0 20px rgba(0,191,166,0.2)" : "none",
                        }}
                      >
                        {done ? <Check className="w-5 h-5 text-white" /> : <Icon className="w-5 h-5" style={{ color: active ? "#ffffff" : "rgba(255,255,255,0.25)" }} />}
                      </div>
                      <p className="text-[10px] mt-1.5 font-bold hidden sm:block" style={{ color: active ? "white" : done ? "#00BFA6" : "rgba(255,255,255,0.25)", fontFamily: "Rubik, sans-serif" }}>
                        {s.label}
                      </p>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="flex-1 h-px mx-3 mt-[-18px] sm:mt-[-8px]" style={{ background: step > s.id ? "rgba(0,191,166,0.4)" : "rgba(255,255,255,0.06)" }} />
                    )}
                  </div>
                );
              })}
            </div>
            {/* Progress bar */}
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${((step - 1) / 3) * 100}%`, background: "linear-gradient(90deg, #FF6B35, #00BFA6)" }}
              />
            </div>
          </div>
        )}

        {/* ─── STEP 1: BRAND INFO ─── */}
        {step === 1 && (
          <div
            className="rounded-3xl p-7 space-y-6"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 24px 48px rgba(0,0,0,0.3)" }}
          >
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "1.25rem" }}>
              <h2 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>
                Brand & Campaign Identity
              </h2>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                Enter your client brand details and campaign information.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[
                { label: "Brand / Agency Name *", value: brandName, set: setBrandName, placeholder: "e.g. Nestlé or EXP Marketing", type: "text" },
                { label: "Campaign Title *", value: campaignTitle, set: setCampaignTitle, placeholder: "e.g. Dettol Hygiene Challenge", type: "text" },
                { label: "Sub-Brand / Tagline", value: subTitle, set: setSubTitle, placeholder: "e.g. GOLDEN MORN", type: "text" },
                { label: "Brand Logo URL", value: logoUrl, set: setLogoUrl, placeholder: "https://example.com/logo.png", type: "url" },
              ].map(({ label, value, set, placeholder, type }) => (
                <div key={label}>
                  <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {label}
                  </label>
                  <input
                    type={type}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder={placeholder}
                    className="w-full rounded-xl px-4 py-3 text-sm"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "rgba(0,191,166,0.5)")}
                    onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                  URL Slug
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={campaignSlug}
                    onChange={(e) => { setSlugEdited(true); setCampaignSlug(e.target.value); }}
                    placeholder="e.g. dettol-hygiene-2026"
                    className="w-full rounded-xl px-4 py-3 text-sm font-mono"
                    style={{ ...inputStyle, color: "#00BFA6" }}
                    onFocus={(e) => (e.target.style.borderColor = "rgba(0,191,166,0.5)")}
                    onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                  />
                </div>
                <p className="text-[11px] mt-1.5 font-mono truncate" style={{ color: "rgba(255,255,255,0.2)" }}>
                  {baseUrl}/?c={activeSlug}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Admin Email *
                </label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@brand.com"
                  className="w-full rounded-xl px-4 py-3 text-sm"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(255,107,53,0.4)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                />
                <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.2)" }}>
                  Login email for the brand admin
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                Admin Password *
              </label>
              <div className="relative">
                <input
                  type={showAdminPassword ? "text" : "password"}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full rounded-xl px-4 py-3 pr-16 text-sm"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(255,107,53,0.4)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                />
                <button type="button" onClick={() => setShowAdminPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold transition-colors"
                  style={{ color: "rgba(255,255,255,0.35)" }}>
                  {showAdminPassword ? "HIDE" : "SHOW"}
                </button>
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.2)" }}>
                Secure password for the primary brand admin login
              </p>
            </div>

            {/* Additional Admins */}
            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/70">
                    Additional Admins / Project Managers (Optional)
                  </label>
                  <p className="text-[11px] text-white/35">
                    Grant multiple team members full admin access to this campaign
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdditionalAdmins([...additionalAdmins, { id: `admin-${Date.now()}`, name: "", email: "", password: "" }])}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-teal-300 bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/20 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Admin
                </button>
              </div>

              {additionalAdmins.map((admin, idx) => (
                <div key={admin.id || idx} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-teal-400">Admin #{idx + 2}</span>
                    <button
                      type="button"
                      onClick={() => setAdditionalAdmins(additionalAdmins.filter((_, i) => i !== idx))}
                      className="text-xs text-white/30 hover:text-red-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Name (e.g. Ade)"
                      value={admin.name}
                      onChange={e => {
                        const arr = [...additionalAdmins];
                        arr[idx].name = e.target.value;
                        setAdditionalAdmins(arr);
                      }}
                      className="rounded-xl px-3 py-2 text-xs"
                      style={inputStyle}
                    />
                    <input
                      type="email"
                      placeholder="Email *"
                      value={admin.email}
                      onChange={e => {
                        const arr = [...additionalAdmins];
                        arr[idx].email = e.target.value;
                        setAdditionalAdmins(arr);
                      }}
                      className="rounded-xl px-3 py-2 text-xs"
                      style={inputStyle}
                    />
                    <input
                      type="password"
                      placeholder="Password *"
                      value={admin.password}
                      onChange={e => {
                        const arr = [...additionalAdmins];
                        arr[idx].password = e.target.value;
                        setAdditionalAdmins(arr);
                      }}
                      className="rounded-xl px-3 py-2 text-xs"
                      style={inputStyle}
                    />
                  </div>
                </div>
              ))}
            </div>


            <div>
              <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                Welcome Message
              </label>
              <textarea
                rows={2}
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm resize-none"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = "rgba(0,191,166,0.5)")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
              />
            </div>

            {/* Toggle */}
            <label className="flex items-center justify-between cursor-pointer p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <p className="text-sm font-bold text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                  1 Spin per Phone Number
                </p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Prevent duplicate spins per device
                </p>
              </div>
              <div
                onClick={() => setOneSpinPerPhone(!oneSpinPerPhone)}
                className="relative w-12 h-6 rounded-full transition-all cursor-pointer flex-shrink-0"
                style={{
                  background: oneSpinPerPhone ? "linear-gradient(135deg, #00BFA6, #0D9488)" : "rgba(255,255,255,0.1)",
                  boxShadow: oneSpinPerPhone ? "0 0 12px rgba(0,191,166,0.4)" : "none",
                }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all"
                  style={{ left: oneSpinPerPhone ? "calc(100% - 22px)" : "2px" }}
                />
              </div>
            </label>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(2)}
                disabled={!campaignTitle}
                className="flex items-center gap-2 px-7 py-3.5 rounded-2xl font-black text-white transition-all disabled:opacity-40 group"
                style={{ background: "linear-gradient(135deg, #00BFA6, #0D9488)", boxShadow: "0 8px 24px rgba(0,191,166,0.35)", fontFamily: "Rubik, sans-serif" }}
              >
                <span>Next: Visual Style</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: VISUAL STYLE ─── */}
        {step === 2 && (
          <div
            className="rounded-3xl p-7 space-y-6"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 24px 48px rgba(0,0,0,0.3)" }}
          >
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "1.25rem" }}>
              <h2 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>
                Visual Identity
              </h2>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                Customize brand colors and gradient themes.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {[
                { label: "Primary Accent", value: primaryColor, set: setPrimaryColor },
                { label: "Secondary Accent", value: secondaryColor, set: setSecondaryColor },
                { label: "Base Background", value: backgroundColor, set: setBackgroundColor },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {label}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-shrink-0">
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="w-12 h-12 rounded-xl cursor-pointer border-0 p-1"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      />
                    </div>
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="w-full rounded-xl px-3 py-3 text-sm font-mono"
                      style={inputStyle}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold mb-3 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                Background Ambient Gradient & Theme Presets
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { name: "Brand Default", desc: "Orange → Turquoise", start: "#FF6B35", end: "#00BFA6", bg: "#070d14", pri: "#00BFA6", sec: "#FF6B35" },
                  { name: "Deep Ocean", desc: "Midnight → Turquoise", start: "#0D1B2A", end: "#00BFA6", bg: "#06101c", pri: "#00BFA6", sec: "#38bdf8" },
                  { name: "Sunset Blaze", desc: "Orange → Deep Ruby", start: "#FF6B35", end: "#e11d48", bg: "#140608", pri: "#FF6B35", sec: "#fbbf24" },
                  { name: "Neon Violet", desc: "Purple → Fuchsia", start: "#8b5cf6", end: "#ec4899", bg: "#0d0618", pri: "#8b5cf6", sec: "#ec4899" },
                  { name: "Emerald Gold", desc: "Emerald → Amber", start: "#10b981", end: "#f59e0b", bg: "#04140d", pri: "#10b981", sec: "#f59e0b" },
                  { name: "Arctic Glow", desc: "Cyan → Crisp White", start: "#06b6d4", end: "#e0e7ff", bg: "#07121b", pri: "#06b6d4", sec: "#a5f3fc" },
                ].map((preset) => {
                  const active = gradientStart === preset.start && gradientEnd === preset.end && backgroundColor === preset.bg;
                  return (
                    <button
                      key={preset.name}
                      onClick={() => {
                        setGradientStart(preset.start);
                        setGradientEnd(preset.end);
                        setBackgroundColor(preset.bg);
                        setPrimaryColor(preset.pri);
                        setSecondaryColor(preset.sec);
                      }}
                      className="p-3.5 rounded-2xl flex items-center gap-3 text-left transition-all hover:scale-[1.02] cursor-pointer"
                      style={{
                        background: active ? "rgba(0,191,166,0.12)" : "rgba(255,255,255,0.03)",
                        border: active ? "1.5px solid #00BFA6" : "1px solid rgba(255,255,255,0.06)",
                        boxShadow: active ? "0 0 20px rgba(0,191,166,0.2)" : "none",
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex-shrink-0 shadow-lg border border-white/20"
                        style={{ background: `linear-gradient(135deg, ${preset.start}, ${preset.end})` }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate" style={{ fontFamily: "Rubik, sans-serif" }}>{preset.name}</p>
                        <p className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{preset.desc}</p>
                      </div>
                      {active && <Check className="w-3.5 h-3.5 flex-shrink-0 text-teal-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live preview */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Live Full-Page Aura Preview
                </label>
                {(isLightColor(primaryColor) || isLightColor(secondaryColor)) && (
                  <span className="text-[10px] text-teal-300 font-bold bg-teal-950/50 border border-teal-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3 text-teal-400" />
                    Auto High-Contrast Mode Active
                  </span>
                )}
              </div>
              <div
                className="w-full h-44 rounded-3xl flex flex-col items-center justify-center text-white shadow-2xl overflow-hidden relative border border-white/10 p-4"
                style={{
                  background: `radial-gradient(circle at 20% 20%, ${gradientStart}50 0%, transparent 60%), radial-gradient(circle at 80% 80%, ${gradientEnd}45 0%, transparent 60%), ${backgroundColor || "#070d14"}`,
                }}
              >
                <div className="absolute top-3 left-3 w-8 h-8 rounded-lg flex items-center justify-center text-xs shadow" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}>
                  🎯
                </div>
                <p className="font-black text-xl text-center" style={{ fontFamily: "Rubik, sans-serif" }}>{campaignTitle || "Your Campaign"}</p>
                {subTitle && (
                  <span
                    className="text-[10px] mt-1.5 font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                    style={{
                      background: isLightColor(secondaryColor) ? "rgba(255,255,255,0.18)" : `${secondaryColor}25`,
                      color: isLightColor(secondaryColor) ? "#ffffff" : secondaryColor,
                      border: `1px solid ${isLightColor(secondaryColor) ? "rgba(255,255,255,0.3)" : `${secondaryColor}40`}`,
                    }}
                  >
                    {subTitle}
                  </span>
                )}
                <div
                  className="mt-3 px-4 py-2 rounded-xl text-xs font-black shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                    color: getGradientContrastColor(primaryColor, secondaryColor),
                    fontFamily: "Rubik, sans-serif",
                  }}
                >
                  🎡 Spin & Win Preview
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-2 px-7 py-3.5 rounded-2xl font-black text-white transition-all group"
                style={{ background: "linear-gradient(135deg, #00BFA6, #0D9488)", boxShadow: "0 8px 24px rgba(0,191,166,0.35)", fontFamily: "Rubik, sans-serif" }}
              >
                <span>Next: Prize Setup</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: PRIZES ─── */}
        {step === 3 && (
          <div
            className="rounded-3xl p-7 space-y-5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 24px 48px rgba(0,0,0,0.3)" }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "1.25rem" }}>
              <div>
                <h2 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>
                  Prize Segments
                </h2>
                <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Configure wheel segments, colors, and win probabilities.
                </p>
              </div>
              <button
                onClick={handleAddPrize}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #FF6B35, #e0531f)", boxShadow: "0 4px 12px rgba(255,107,53,0.3)", fontFamily: "Rubik, sans-serif" }}
              >
                <Plus className="w-4 h-4" /> Add Segment
              </button>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {prizes.map((prize, idx) => {
                const pct = totalWeight > 0 ? Math.round((Math.max(prize.weight, 0) / totalWeight) * 100) : 0;
                return (
                  <div
                    key={prize.id || idx}
                    className="rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <span className="text-xs font-mono font-bold w-5 text-center flex-shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>{idx + 1}</span>
                      <input
                        type="color"
                        value={prize.color}
                        onChange={(e) => handleUpdatePrize(idx, "color", e.target.value)}
                        className="w-9 h-9 rounded-xl cursor-pointer border-0 flex-shrink-0"
                        style={{ background: "transparent", padding: "2px" }}
                      />
                      <input
                        type="text"
                        value={prize.label}
                        onChange={(e) => handleUpdatePrize(idx, "label", e.target.value)}
                        placeholder="Prize name"
                        className="flex-1 md:w-44 rounded-xl px-3 py-2 text-sm font-bold outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)", color: "white" }}
                        onFocus={(e) => (e.target.style.borderColor = "rgba(0,191,166,0.4)")}
                        onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.06)")}
                      />
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>Wt.</span>
                        <input
                          type="number"
                          min="0"
                          value={prize.weight}
                          onChange={(e) => handleUpdatePrize(idx, "weight", Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-14 rounded-xl px-2 py-2 text-xs text-center font-mono outline-none"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)", color: "white" }}
                        />
                        <div
                          className="px-2 py-1 text-center rounded-lg text-xs font-black font-mono"
                          style={{ background: `${prize.color}20`, color: prize.color, border: `1px solid ${prize.color}30` }}
                        >
                          {pct}%
                        </div>
                      </div>

                      {/* Stock Quantity Pool Input */}
                      {!prize.isLosing ? (
                        <div className="flex items-center gap-1.5 bg-white/[0.04] px-2.5 py-1.5 rounded-xl border border-white/5" title="Total Gift Quantity Pool (leave empty for unlimited)">
                          <span className="text-[11px] font-bold uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>Qty</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="∞"
                            value={prize.quantity !== undefined && prize.quantity !== null ? prize.quantity : ""}
                            onChange={(e) => {
                              const val = e.target.value === "" ? undefined : Math.max(0, parseInt(e.target.value) || 0);
                              handleUpdatePrize(idx, "quantity", val);
                            }}
                            className="w-16 rounded-lg px-2 py-1 text-xs text-white text-center font-mono outline-none"
                            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
                          />
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-white/30 px-2">No Limit</span>
                      )}

                      <label className="flex items-center gap-1.5 cursor-pointer px-2.5 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <input
                          type="checkbox"
                          checked={!!prize.isLosing}
                          onChange={(e) => handleUpdatePrize(idx, "isLosing", e.target.checked)}
                          className="w-3.5 h-3.5 accent-red-500 cursor-pointer"
                        />
                        <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Loss</span>
                      </label>

                      <button
                        onClick={() => handleDeletePrize(idx)}
                        className="p-2 rounded-xl transition-colors"
                        style={{ color: "rgba(255,255,255,0.2)" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#f87171")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.2)")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              <button
                onClick={handleLaunchCampaign}
                disabled={saving || !prizes.length}
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-2xl font-black text-white transition-all disabled:opacity-40 group"
                style={{
                  background: "linear-gradient(135deg, #FF6B35, #00BFA6)",
                  boxShadow: "0 8px 24px rgba(255,107,53,0.4)",
                  fontFamily: "Rubik, sans-serif",
                  fontSize: "15px",
                }}
              >
                <Rocket className="w-5 h-5" />
                {saving ? "Launching…" : "Launch Campaign!"}
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: LAUNCH & LINKS ─── */}
        {step === 4 && (
          <div className="space-y-6">
            {/* Hero success card */}
            <div
              className="rounded-3xl p-8 text-center space-y-4"
              style={{
                background: "radial-gradient(circle at 50% 40%, rgba(0,191,166,0.12), transparent 70%), rgba(255,255,255,0.03)",
                border: "1px solid rgba(0,191,166,0.15)",
              }}
            >
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-2xl"
                style={{ background: "linear-gradient(135deg, rgba(0,191,166,0.3), rgba(16,185,129,0.3))", border: "1px solid rgba(0,191,166,0.3)" }}
              >
                <CheckCircle2 className="w-10 h-10" style={{ color: "#00BFA6" }} />
              </div>

              <div>
                <h2 className="text-3xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>
                  Campaign Live! 🎉
                </h2>
                <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                  <span style={{ color: "#00BFA6", fontWeight: 700 }}>"{campaignTitle}"</span> is configured and ready for activation.
                </p>
              </div>
            </div>

            {/* Three link cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  emoji: "📱",
                  title: "Attendee Wheel",
                  desc: "Mobile URL for participants to register and spin.",
                  url: wheelUrl,
                  type: "wheel",
                  href: `/?c=${activeSlug}`,
                  accent: "#00BFA6",
                  btnLabel: "Open Wheel",
                },
                {
                  emoji: "🔐",
                  title: "Admin Dashboard",
                  desc: "Manage prizes, view analytics, export CSV data.",
                  url: adminUrl,
                  type: "admin",
                  href: `/admin?c=${activeSlug}`,
                  accent: "#a78bfa",
                  btnLabel: "Open Admin",
                },
                {
                  emoji: "📺",
                  title: "TV Stage Display",
                  desc: "Fullscreen mode with QR code and live winner feed.",
                  url: tvUrl,
                  type: "tv",
                  href: `/tv?c=${activeSlug}`,
                  accent: "#FF6B35",
                  btnLabel: "Open TV",
                },
              ].map(({ emoji, title, desc, url, type, href, accent, btnLabel }) => (
                <div
                  key={type}
                  className="rounded-2xl p-5 flex flex-col justify-between space-y-4"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="space-y-2">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                      style={{ background: `${accent}18`, border: `1px solid ${accent}25` }}
                    >
                      {emoji}
                    </div>
                    <h3 className="font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>{title}</h3>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{desc}</p>
                  </div>

                  <div
                    className="rounded-xl p-2.5 flex items-center justify-between"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <span className="text-[11px] font-mono truncate" style={{ color: accent }}>{url}</span>
                    <button
                      onClick={() => handleCopy(url, type)}
                      className="ml-2 p-1 rounded-lg flex-shrink-0 transition-all"
                      style={{ color: "rgba(255,255,255,0.3)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "white")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)")}
                    >
                      {copiedLink === type ? <Check className="w-3.5 h-3.5" style={{ color: "#10b981" }} /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <Link
                    href={href}
                    target="_blank"
                    className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white transition-all"
                    style={{
                      background: `${accent}25`,
                      border: `1px solid ${accent}35`,
                      color: accent,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = `${accent}35`)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = `${accent}25`)}
                  >
                    {btnLabel}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ))}
            </div>

            {/* QR Code */}
            <div
              className="rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="bg-white p-4 rounded-2xl shadow-xl flex-shrink-0">
                <QRCodeSVG value={wheelUrl} size={160} />
              </div>
              <div className="text-center sm:text-left space-y-2">
                <h4 className="font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Event Activation QR Code</h4>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Print, display, or project this QR code at your activation booth so attendees can scan and spin from their mobile phones.
                </p>
                <div className="flex gap-2 pt-2">
                  <Link
                    href="/create-campaign"
                    onClick={() => { setStep(1); setBrandName(""); setCampaignTitle(""); setCampaignSlug(""); setSlugEdited(false); }}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    + Create Another
                  </Link>
                  <Link
                    href="/super-admin"
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }}
                  >
                    View All Campaigns →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
