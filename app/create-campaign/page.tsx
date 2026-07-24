"use client";

import { useState, useEffect } from "react";
import type { Campaign, Prize } from "@/types";
import { updateCampaign } from "@/lib/campaign";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  Sparkles,
  Rocket,
  CheckCircle2,
  Copy,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  Trophy,
  Palette,
  Briefcase,
  Sliders,
  Plus,
  Trash2,
} from "lucide-react";

export default function CreateCampaignWizard() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [brandName, setBrandName] = useState("");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [subTitle, setSubTitle] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [campaignSlug, setCampaignSlug] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState(
    "Spin the wheel for a chance to win instant rewards!"
  );
  const [adminPin, setAdminPin] = useState("1234");
  const [oneSpinPerPhone, setOneSpinPerPhone] = useState(true);

  // Theme State
  const [primaryColor, setPrimaryColor] = useState("#00BFA6");
  const [secondaryColor, setSecondaryColor] = useState("#FF6B35");
  const [gradientStart, setGradientStart] = useState("#FF6B35");
  const [gradientEnd, setGradientEnd] = useState("#00BFA6");

  // Prizes State
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  // Auto-generate slug from campaign title
  useEffect(() => {
    if (campaignTitle && !campaignSlug) {
      const generated = campaignTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
      setCampaignSlug(generated);
    }
  }, [campaignTitle, campaignSlug]);

  function handleUpdatePrize(index: number, field: keyof Prize, value: any) {
    const updated = [...prizes];
    updated[index] = { ...updated[index], [field]: value };
    setPrizes(updated);
  }

  function handleAddPrize() {
    const newPrize: Prize = {
      id: `prize-${Date.now()}`,
      label: "New Reward",
      color: "#00BFA6",
      weight: 10,
      isLosing: false,
    };
    setPrizes([...prizes, newPrize]);
  }

  function handleDeletePrize(index: number) {
    setPrizes(prizes.filter((_, i) => i !== index));
  }

  async function handleLaunchCampaign() {
    setSaving(true);
    const finalSlug =
      campaignSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
      `campaign-${Date.now()}`;

    const newCampaign: Campaign = {
      id: finalSlug,
      name: campaignTitle || "Brand Experiential Activation",
      subTitle: subTitle || brandName,
      logoUrl: logoUrl || undefined,
      primaryColor,
      secondaryColor,
      backgroundColor: "#0D1B2A",
      gradientStart,
      gradientEnd,
      welcomeMessage,
      oneSpinPerPhone,
      active: true,
      adminPin: adminPin || "1234",
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

  const activeSlug =
    campaignSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
    "demo-campaign";

  const wheelUrl = `${baseUrl}/?c=${activeSlug}`;
  const adminUrl = `${baseUrl}/admin?c=${activeSlug}`;
  const tvUrl = `${baseUrl}/tv?c=${activeSlug}`;

  const totalWeight = prizes.reduce(
    (sum, p) => sum + Math.max(p.weight, 0),
    0
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-teal-500 to-orange-500 rounded-xl flex items-center justify-center font-bold text-white shadow-md">
              🚀
            </div>
            <div>
              <h1 className="font-bold text-lg text-white leading-tight">
                Brand Campaign Builder
              </h1>
              <p className="text-xs text-slate-400">
                Host experiential marketing spin-the-wheel promotions
              </p>
            </div>
          </div>

          <Link
            href="/admin"
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            ← Back to Admin
          </Link>
        </div>
      </header>

      {/* Main Wizard Container */}
      <main className="max-w-4xl mx-auto px-4 pt-10">
        {/* Progress Bar */}
        <div className="mb-10">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-3">
            <span className={step >= 1 ? "text-teal-400 font-bold" : ""}>
              1. Brand Info
            </span>
            <span className={step >= 2 ? "text-teal-400 font-bold" : ""}>
              2. Visual Identity
            </span>
            <span className={step >= 3 ? "text-teal-400 font-bold" : ""}>
              3. Prizes & Odds
            </span>
            <span className={step === 4 ? "text-teal-400 font-bold" : ""}>
              4. Launch & Links
            </span>
          </div>
          <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-teal-400 transition-all duration-300"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* STEP 1: BRAND INFO */}
        {step === 1 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6 shadow-xl">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-2xl font-bold text-white">Brand & Campaign Identity</h2>
              <p className="text-slate-400 text-xs mt-1">
                Enter details for your client or promotional campaign.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Brand / Agency Name *
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Nestlé or EXP Marketing"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-xl px-4 py-3 text-white text-sm outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Campaign Title *
                </label>
                <input
                  type="text"
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  placeholder="e.g. Dettol Hygiene Challenge"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-xl px-4 py-3 text-white text-sm outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Sub-Brand / Product Tagline (Winner Screen Subtext)
                </label>
                <input
                  type="text"
                  value={subTitle}
                  onChange={(e) => setSubTitle(e.target.value)}
                  placeholder="e.g. GOLDEN MORN or Instant Rewards"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-xl px-4 py-3 text-white text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Brand Logo Image URL (Optional)
                </label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-xl px-4 py-3 text-white text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Campaign URL Slug (Unique Identifier)
                </label>
                <input
                  type="text"
                  value={campaignSlug}
                  onChange={(e) => setCampaignSlug(e.target.value)}
                  placeholder="e.g. dettol-hygiene-2026"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-xl px-4 py-3 text-teal-400 font-mono text-sm outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  URL: {baseUrl}/?c={activeSlug}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Admin Passcode PIN (Secret Access)
                </label>
                <input
                  type="text"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="1234"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-xl px-4 py-3 text-white text-sm outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Welcome Message Copy
              </label>
              <textarea
                rows={2}
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-xl px-4 py-3 text-white text-sm outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={oneSpinPerPhone}
                  onChange={(e) => setOneSpinPerPhone(e.target.checked)}
                  className="w-5 h-5 rounded accent-teal-500 cursor-pointer"
                />
                <span className="text-xs text-slate-300 font-semibold">
                  Enforce 1 spin per phone number
                </span>
              </label>

              <button
                onClick={() => setStep(2)}
                disabled={!campaignTitle}
                className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-6 py-3 rounded-xl transition-all disabled:opacity-50"
              >
                <span>Next: Visual Identity</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: VISUAL IDENTITY */}
        {step === 2 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6 shadow-xl">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-2xl font-bold text-white">Visual Identity & Colors</h2>
              <p className="text-slate-400 text-xs mt-1">
                Customize brand colors and gradient themes to match client guidelines.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Primary Accent Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-12 h-12 rounded-xl border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Secondary Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-12 h-12 rounded-xl border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Preset Brand Gradient Themes
              </label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: "Vibrant Orange & Turquoise", start: "#FF6B35", end: "#00BFA6" },
                  { name: "Midnight Blue & Turquoise", start: "#0D1B2A", end: "#00BFA6" },
                  { name: "Vibrant Orange & Midnight", start: "#FF6B35", end: "#0D1B2A" },
                  { name: "Digital Turquoise & Gray", start: "#00BFA6", end: "#F3F4F6" },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      setGradientStart(preset.start);
                      setGradientEnd(preset.end);
                    }}
                    className="p-4 rounded-xl border border-slate-800 flex items-center gap-3 hover:border-teal-500 transition-all text-left bg-slate-950"
                  >
                    <div
                      className="w-10 h-10 rounded-lg shadow-inner flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${preset.start}, ${preset.end})`,
                      }}
                    />
                    <span className="text-xs font-semibold text-slate-200">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-6">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 text-slate-400 hover:text-white font-semibold text-sm"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-6 py-3 rounded-xl transition-all"
              >
                <span>Next: Prize Setup</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PRIZES SETUP */}
        {step === 3 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Wheel Prizes & Probabilities</h2>
                <p className="text-slate-400 text-xs mt-1">
                  Configure segment labels, colors, and relative winning weights.
                </p>
              </div>

              <button
                onClick={handleAddPrize}
                className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition-all"
              >
                <Plus className="w-4 h-4" /> Add Segment
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {prizes.map((prize, idx) => {
                const pct =
                  totalWeight > 0
                    ? Math.round((Math.max(prize.weight, 0) / totalWeight) * 100)
                    : 0;

                return (
                  <div
                    key={prize.id || idx}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <span className="text-xs font-mono font-bold text-slate-500 w-6">
                        #{idx + 1}
                      </span>
                      <input
                        type="color"
                        value={prize.color}
                        onChange={(e) =>
                          handleUpdatePrize(idx, "color", e.target.value)
                        }
                        className="w-9 h-9 rounded-lg border-0 bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={prize.label}
                        onChange={(e) =>
                          handleUpdatePrize(idx, "label", e.target.value)
                        }
                        placeholder="Prize name"
                        className="flex-1 md:w-48 bg-slate-900 border border-slate-800 focus:border-teal-500 rounded-lg px-3 py-2 text-sm text-white outline-none font-semibold"
                      />
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-400 font-semibold">
                          Weight:
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={prize.weight}
                          onChange={(e) =>
                            handleUpdatePrize(
                              idx,
                              "weight",
                              Math.max(0, parseInt(e.target.value) || 0)
                            )
                          }
                          className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none text-center font-mono"
                        />
                        <span className="text-xs font-bold text-teal-400 w-12 text-right">
                          {pct}%
                        </span>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg">
                        <input
                          type="checkbox"
                          checked={!!prize.isLosing}
                          onChange={(e) =>
                            handleUpdatePrize(idx, "isLosing", e.target.checked)
                          }
                          className="w-4 h-4 rounded accent-red-500 cursor-pointer"
                        />
                        <span className="text-xs text-slate-300 font-medium">
                          Try Again
                        </span>
                      </label>

                      <button
                        onClick={() => handleDeletePrize(idx)}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                        title="Delete prize"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-6">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 text-slate-400 hover:text-white font-semibold text-sm"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              <button
                onClick={handleLaunchCampaign}
                disabled={saving || !prizes.length}
                className="flex items-center gap-2 bg-gradient-to-r from-teal-400 to-emerald-500 text-slate-950 font-extrabold px-8 py-3.5 rounded-xl shadow-lg shadow-teal-500/25 transition-all text-base disabled:opacity-50"
              >
                <Rocket className="w-5 h-5" />
                <span>{saving ? "Launching Campaign..." : "Launch Campaign Live!"}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: LAUNCH & LINKS */}
        {step === 4 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-8 shadow-2xl">
            <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/30 rounded-3xl flex items-center justify-center mx-auto text-emerald-400 shadow-lg">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-extrabold text-white">
                Campaign Live & Ready!
              </h2>
              <p className="text-slate-400 text-sm max-w-lg mx-auto">
                Your brand campaign <span className="text-teal-400 font-bold">"{campaignTitle}"</span> is live. Share these links with attendees, event managers, and TV displays.
              </p>
            </div>

            {/* Generated Links Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              {/* Card 1: Attendee Wheel */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="w-10 h-10 bg-teal-500/20 border border-teal-500/30 rounded-xl flex items-center justify-center text-teal-400">
                    📱
                  </div>
                  <h3 className="font-bold text-white text-base">Attendee Wheel URL</h3>
                  <p className="text-slate-400 text-xs">
                    Link for attendees to register and spin on their mobile phones.
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs font-mono text-teal-400">
                  <span className="truncate">{wheelUrl}</span>
                  <button
                    onClick={() => handleCopy(wheelUrl, "wheel")}
                    className="ml-2 text-slate-400 hover:text-white"
                  >
                    {copiedLink === "wheel" ? "Copied!" : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <Link
                  href={`/?c=${activeSlug}`}
                  target="_blank"
                  className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-2.5 rounded-xl transition-all text-xs flex items-center justify-center gap-2"
                >
                  <span>Open Wheel</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Card 2: Brand Admin */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="w-10 h-10 bg-purple-500/20 border border-purple-500/30 rounded-xl flex items-center justify-center text-purple-400">
                    🔐
                  </div>
                  <h3 className="font-bold text-white text-base">Admin Dashboard</h3>
                  <p className="text-slate-400 text-xs">
                    View real-time analytics, export attendee CSV data, and edit prizes.
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs font-mono text-purple-400">
                  <span className="truncate">{adminUrl}</span>
                  <button
                    onClick={() => handleCopy(adminUrl, "admin")}
                    className="ml-2 text-slate-400 hover:text-white"
                  >
                    {copiedLink === "admin" ? "Copied!" : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <Link
                  href={`/admin?c=${activeSlug}`}
                  target="_blank"
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl transition-all text-xs flex items-center justify-center gap-2"
                >
                  <span>Open Dashboard</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Card 3: TV Display */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="w-10 h-10 bg-orange-500/20 border border-orange-500/30 rounded-xl flex items-center justify-center text-orange-400">
                    📺
                  </div>
                  <h3 className="font-bold text-white text-base">TV Stage Display</h3>
                  <p className="text-slate-400 text-xs">
                    Fullscreen 4K TV mode with large QR code and live winner feed.
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs font-mono text-orange-400">
                  <span className="truncate">{tvUrl}</span>
                  <button
                    onClick={() => handleCopy(tvUrl, "tv")}
                    className="ml-2 text-slate-400 hover:text-white"
                  >
                    {copiedLink === "tv" ? "Copied!" : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <Link
                  href={`/tv?c=${activeSlug}`}
                  target="_blank"
                  className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-2.5 rounded-xl transition-all text-xs flex items-center justify-center gap-2"
                >
                  <span>Launch TV View</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* QR Code Container */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 max-w-sm mx-auto space-y-4">
              <h4 className="text-sm font-bold text-white">Event Activation QR Code</h4>
              <div className="bg-white p-4 rounded-xl flex items-center justify-center mx-auto w-fit">
                <QRCodeSVG value={wheelUrl} size={180} />
              </div>
              <p className="text-xs text-slate-400">
                Print or project this QR code at activation booths.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
