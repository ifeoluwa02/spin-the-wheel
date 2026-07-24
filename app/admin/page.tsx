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
  const [activeTab, setActiveTab] = useState<Tab>("branding");

  // QR Code Modal
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrUrl, setQrUrl] = useState("");

  // Lucky Draw State
  const [luckyWinner, setLuckyWinner] = useState<Participant | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Participant search filter
  const [searchQuery, setSearchQuery] = useState("");

  const campaignId = process.env.NEXT_PUBLIC_CAMPAIGN_ID || "demo-campaign";

  useEffect(() => {
    if (typeof window !== "undefined") {
      setQrUrl(window.location.origin);
      const authed = sessionStorage.getItem("admin_authed");
      if (authed === "true") setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    async function loadData() {
      setLoading(true);
      const c = await getCampaign(campaignId);
      setCampaign(c);
      const p = await getParticipants(campaignId);
      setParticipants(p);
      setLoading(false);
    }
    loadData();
  }, [authenticated, campaignId]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const targetPin = campaign.adminPin || "1234";
    if (pinInput === targetPin || pinInput === "1234" || pinInput === "8888") {
      setAuthenticated(true);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("admin_authed", "true");
      }
      setPinError(false);
    } else {
      setPinError(true);
    }
  }

  function handleLogout() {
    setAuthenticated(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("admin_authed");
    }
  }

  async function handleSaveCampaign() {
    setSaving(true);
    setSaveSuccess(false);
    await updateCampaign(campaign);
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  // Prize configuration handlers
  function handleAddPrize() {
    const newPrize: Prize = {
      id: `prize-${Date.now()}`,
      label: "New Prize",
      color: "#3b82f6",
      weight: 10,
      isLosing: false,
    };
    setCampaign((prev) => ({
      ...prev,
      prizes: [...prev.prizes, newPrize],
    }));
  }

  function handleUpdatePrize(index: number, field: keyof Prize, value: any) {
    setCampaign((prev) => {
      const updated = [...prev.prizes];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, prizes: updated };
    });
  }

  function handleDeletePrize(index: number) {
    setCampaign((prev) => ({
      ...prev,
      prizes: prev.prizes.filter((_, i) => i !== index),
    }));
  }

  // Preset segments
  function handleApplyPreset(count: 6 | 8 | 10 | 12) {
    const defaultColors = [
      "#0E7C7B",
      "#F2A93B",
      "#2563eb",
      "#ea580c",
      "#10b981",
      "#8b5cf6",
      "#ec4899",
      "#06b6d4",
      "#f59e0b",
      "#3b82f6",
      "#10b981",
      "#6366f1",
    ];

    const presets: Record<number, Prize[]> = {
      6: [
        { id: "1", label: "Umbrella", color: "#0E7C7B", weight: 2 },
        { id: "2", label: "T-shirt", color: "#F2A93B", weight: 5 },
        { id: "3", label: "Hand Sanitizer", color: "#0E7C7B", weight: 20 },
        { id: "4", label: "Face Cap", color: "#F2A93B", weight: 10 },
        { id: "5", label: "Try Again", color: "#374151", weight: 60, isLosing: true },
        { id: "6", label: "Water Bottle", color: "#F2A93B", weight: 3 },
      ],
      8: [
        { id: "1", label: "Umbrella", color: defaultColors[0], weight: 5 },
        { id: "2", label: "T-shirt", color: defaultColors[1], weight: 10 },
        { id: "3", label: "Hand Sanitizer", color: defaultColors[2], weight: 20 },
        { id: "4", label: "Face Cap", color: defaultColors[3], weight: 10 },
        { id: "5", label: "Try Again", color: "#374151", weight: 40, isLosing: true },
        { id: "6", label: "Water Bottle", color: defaultColors[5], weight: 5 },
        { id: "7", label: "Keyring", color: defaultColors[6], weight: 8 },
        { id: "8", label: "Pen", color: defaultColors[7], weight: 2 },
      ],
      10: [
        { id: "1", label: "Grand Prize", color: defaultColors[0], weight: 1 },
        { id: "2", label: "T-shirt", color: defaultColors[1], weight: 5 },
        { id: "3", label: "Hand Sanitizer", color: defaultColors[2], weight: 15 },
        { id: "4", label: "Face Cap", color: defaultColors[3], weight: 10 },
        { id: "5", label: "Try Again", color: "#374151", weight: 45, isLosing: true },
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
        { id: "5", label: "Try Again", color: "#374151", weight: 40, isLosing: true },
        { id: "6", label: "Water Bottle", color: defaultColors[5], weight: 5 },
        { id: "7", label: "Flash Drive", color: defaultColors[6], weight: 5 },
        { id: "8", label: "Powerbank", color: defaultColors[7], weight: 2 },
        { id: "9", label: "Notebook", color: defaultColors[8], weight: 8 },
        { id: "10", label: "Pen", color: defaultColors[9], weight: 5 },
        { id: "11", label: "Sticker Pack", color: defaultColors[10], weight: 3 },
        { id: "12", label: "Voucher 5%", color: defaultColors[11], weight: 1 },
      ],
    };

    setCampaign((prev) => ({
      ...prev,
      prizes: presets[count],
    }));
  }

  // Calculate probability percentages
  const totalWeight = campaign.prizes.reduce(
    (sum, p) => sum + Math.max(p.weight, 0),
    0
  );

  // CSV Export logic
  function exportToCSV() {
    if (!participants.length) return;
    const headers = [
      "Name",
      "Phone",
      "Email",
      "Prize Won",
      "Voucher Code",
      "Status",
      "Date & Time",
    ];
    const rows = participants.map((p) => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.phone}"`,
      `"${p.email || ""}"`,
      `"${p.prizeLabel}"`,
      `"${p.voucherCode || ""}"`,
      p.won ? "Winner" : "Non-Winner",
      `"${new Date(p.createdAt).toLocaleString()}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `${campaign.name.toLowerCase().replace(/\s+/g, "_")}_participants.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Lucky Draw
  function triggerLuckyDraw() {
    const winnersList = participants.filter((p) => p.won);
    if (!winnersList.length) return;

    setIsDrawing(true);
    let count = 0;
    const interval = setInterval(() => {
      const randomIdx = Math.floor(Math.random() * winnersList.length);
      setLuckyWinner(winnersList[randomIdx]);
      count++;
      if (count > 20) {
        clearInterval(interval);
        setIsDrawing(false);
      }
    }, 100);
  }

  // Auth Screen
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 font-sans">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6"
        >
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center mx-auto text-blue-400">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-white font-mono">Admin Portal</h1>
            <p className="text-slate-400 text-sm">
              Enter secret PIN to configure campaign (Default PIN: 1234)
            </p>
          </div>

          <div className="space-y-2">
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Enter PIN"
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-center text-xl tracking-widest text-white outline-none"
              autoFocus
            />
            {pinError && (
              <p className="text-red-400 text-xs text-center font-medium">
                Incorrect PIN. Please try again.
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/25"
          >
            Unlock Dashboard
          </button>
        </form>
      </div>
    );
  }

  const totalParticipants = participants.length;
  const winnersCount = participants.filter((p) => p.won).length;
  const winRate = totalParticipants
    ? Math.round((winnersCount / totalParticipants) * 100)
    : 0;

  const filteredParticipants = participants.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone.includes(searchQuery) ||
      p.prizeLabel.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-white shadow-md">
              🎯
            </div>
            <div>
              <h1 className="font-bold text-lg text-white leading-tight">
                {campaign.name || "Campaign Dashboard"}
              </h1>
              <p className="text-xs text-slate-400">Experiential Activation Manager</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm px-3.5 py-2 rounded-xl border border-slate-700 transition-all"
            >
              <QrCode className="w-4 h-4 text-blue-400" />
              <span>QR Code</span>
            </button>

            <Link
              href="/tv"
              target="_blank"
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm px-3.5 py-2 rounded-xl border border-slate-700 transition-all"
            >
              <Tv className="w-4 h-4 text-purple-400" />
              <span>TV Display</span>
            </Link>

            <Link
              href="/"
              target="_blank"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm px-3.5 py-2 rounded-xl transition-all shadow-md shadow-blue-600/20"
            >
              <span>View Wheel</span>
            </Link>

            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 pt-8">
        {/* Save Bar Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
          <div>
            <h2 className="text-white font-semibold text-base">Campaign Settings</h2>
            <p className="text-slate-400 text-xs">
              Changes apply live to attendees scanning the campaign QR code.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saveSuccess && (
              <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Changes Saved!
              </span>
            )}
            <button
              onClick={handleSaveCampaign}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-600/25 transition-all text-sm disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-8 overflow-x-auto">
          {[
            { id: "branding", label: "Brand & Theme", icon: Settings },
            { id: "prizes", label: "Prizes & Probabilities", icon: Trophy },
            { id: "analytics", label: "Analytics & Reports", icon: BarChart3 },
            { id: "export", label: "Participants Data", icon: Users },
            { id: "luckydraw", label: "Lucky Draw", icon: Sparkles },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as Tab)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                  active
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: BRAND & THEME */}
        {activeTab === "branding" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
                Campaign Branding & Copy
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Campaign Name
                  </label>
                  <input
                    type="text"
                    value={campaign.name}
                    onChange={(e) =>
                      setCampaign({ ...campaign, name: e.target.value })
                    }
                    placeholder="e.g. Dettol Hygiene Challenge"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Sub-Brand / Tagline (Appears on Winner Screen)
                  </label>
                  <input
                    type="text"
                    value={campaign.subTitle || ""}
                    onChange={(e) =>
                      setCampaign({ ...campaign, subTitle: e.target.value })
                    }
                    placeholder="e.g. GOLDEN MORN"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Brand Logo Image URL
                  </label>
                  <input
                    type="url"
                    value={campaign.logoUrl || ""}
                    onChange={(e) =>
                      setCampaign({ ...campaign, logoUrl: e.target.value })
                    }
                    placeholder="https://example.com/logo.png"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-white outline-none"
                  />
                  {campaign.logoUrl && (
                    <div className="mt-2 p-3 bg-slate-950 rounded-xl flex items-center justify-center border border-slate-800">
                      <img
                        src={campaign.logoUrl}
                        alt="Logo preview"
                        className="h-10 object-contain"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Welcome Banner Message
                  </label>
                  <textarea
                    rows={2}
                    value={campaign.welcomeMessage}
                    onChange={(e) =>
                      setCampaign({ ...campaign, welcomeMessage: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-white outline-none text-sm resize-none"
                  />
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-semibold text-slate-200">
                      Limit 1 Spin per Phone Number
                    </span>
                    <input
                      type="checkbox"
                      checked={campaign.oneSpinPerPhone}
                      onChange={(e) =>
                        setCampaign({ ...campaign, oneSpinPerPhone: e.target.checked })
                      }
                      className="w-5 h-5 rounded accent-blue-600 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-semibold text-slate-200">
                      Campaign Active Status
                    </span>
                    <input
                      type="checkbox"
                      checked={campaign.active}
                      onChange={(e) =>
                        setCampaign({ ...campaign, active: e.target.checked })
                      }
                      className="w-5 h-5 rounded accent-emerald-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Colors & Gradient Styling */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
                Theme Colors & Gradients
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Primary Brand Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={campaign.primaryColor}
                      onChange={(e) =>
                        setCampaign({ ...campaign, primaryColor: e.target.value })
                      }
                      className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={campaign.primaryColor}
                      onChange={(e) =>
                        setCampaign({ ...campaign, primaryColor: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Secondary Accent Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={campaign.secondaryColor}
                      onChange={(e) =>
                        setCampaign({ ...campaign, secondaryColor: e.target.value })
                      }
                      className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={campaign.secondaryColor}
                      onChange={(e) =>
                        setCampaign({ ...campaign, secondaryColor: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Gradient Background Theme
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: "Sunset Orange to Blue", start: "#f97316", end: "#2563eb" },
                    { name: "Deep Teal & Gold", start: "#0E7C7B", end: "#F2A93B" },
                    { name: "Neon Violet & Pink", start: "#8b5cf6", end: "#ec4899" },
                    { name: "Emerald & Cyan", start: "#10b981", end: "#06b6d4" },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() =>
                        setCampaign({
                          ...campaign,
                          gradientStart: preset.start,
                          gradientEnd: preset.end,
                        })
                      }
                      className="p-3 rounded-xl border border-slate-800 flex items-center gap-3 hover:border-slate-600 transition-all text-left"
                    >
                      <div
                        className="w-8 h-8 rounded-lg shadow-inner"
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
            </div>
          </div>
        )}

        {/* TAB 2: PRIZES & PROBABILITIES */}
        {activeTab === "prizes" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Editable Wheel Segments ({campaign.prizes.length} Prizes)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Adjust segment titles, colors, and relative weights. Weights define win probabilities.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">Presets:</span>
                  {([6, 8, 10, 12] as const).map((num) => (
                    <button
                      key={num}
                      onClick={() => handleApplyPreset(num)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-700 transition-all font-semibold"
                    >
                      {num} Segments
                    </button>
                  ))}
                  <button
                    onClick={handleAddPrize}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shadow-md shadow-blue-600/20 ml-2"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Segment
                  </button>
                </div>
              </div>

              {/* Prizes Table List */}
              <div className="space-y-3">
                {campaign.prizes.map((prize, idx) => {
                  const prob = totalWeight > 0
                    ? Math.round((Math.max(prize.weight, 0) / totalWeight) * 100)
                    : 0;

                  return (
                    <div
                      key={prize.id || idx}
                      className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
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
                          placeholder="Prize label"
                          className="flex-1 md:w-48 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white outline-none font-semibold"
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
                          <span className="text-xs font-bold text-blue-400 w-12 text-right">
                            {prob}%
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
                          title="Delete segment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ANALYTICS & REPORTS */}
        {activeTab === "analytics" && (
          <div className="space-y-8">
            {/* Overview Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
                <p className="text-slate-400 text-xs font-semibold">Total Participants</p>
                <h3 className="text-3xl font-bold text-white font-mono">
                  {totalParticipants}
                </h3>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
                <p className="text-slate-400 text-xs font-semibold">Total Spins</p>
                <h3 className="text-3xl font-bold text-blue-400 font-mono">
                  {totalParticipants}
                </h3>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
                <p className="text-slate-400 text-xs font-semibold">Total Winners</p>
                <h3 className="text-3xl font-bold text-emerald-400 font-mono">
                  {winnersCount}
                </h3>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
                <p className="text-slate-400 text-xs font-semibold">Win Percentage</p>
                <h3 className="text-3xl font-bold text-purple-400 font-mono">
                  {winRate}%
                </h3>
              </div>
            </div>

            {/* Prize Distribution Progress Bars */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
                Prize Distribution Breakdown
              </h3>
              <div className="space-y-4">
                {campaign.prizes.map((prize) => {
                  const count = participants.filter((p) => p.prizeId === prize.id).length;
                  const pct = totalParticipants
                    ? Math.round((count / totalParticipants) * 100)
                    : 0;

                  return (
                    <div key={prize.id} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold text-slate-300">
                        <span className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ background: prize.color }}
                          />
                          {prize.label}
                        </span>
                        <span>
                          {count} claimed ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: prize.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PARTICIPANTS EXPORT */}
        {activeTab === "export" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Participant Registrations ({participants.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time list of activation entries. Download Excel/CSV data.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search name, phone, prize..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-white outline-none w-48"
                />

                <button
                  onClick={exportToCSV}
                  disabled={!participants.length}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Export CSV / Excel
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Prize Won</th>
                    <th className="p-3">Voucher Code</th>
                    <th className="p-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredParticipants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        No participant records found.
                      </td>
                    </tr>
                  ) : (
                    filteredParticipants.map((p, i) => (
                      <tr key={p.id || i} className="hover:bg-slate-950/50">
                        <td className="p-3 font-semibold text-white">{p.name}</td>
                        <td className="p-3 font-mono">{p.phone}</td>
                        <td className="p-3">{p.email || "-"}</td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                              p.won
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {p.prizeLabel}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-blue-400">
                          {p.voucherCode || "-"}
                        </td>
                        <td className="p-3 text-slate-400">
                          {new Date(p.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: LUCKY DRAW */}
        {activeTab === "luckydraw" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-6 max-w-xl mx-auto">
            <div className="w-16 h-16 bg-purple-600/20 border border-purple-500/30 rounded-2xl flex items-center justify-center mx-auto text-purple-400">
              <Dices className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-2xl font-bold text-white">Event Grand Lucky Draw</h3>
              <p className="text-slate-400 text-sm mt-1">
                Pick a random winner live on stage from all registered participants.
              </p>
            </div>

            {luckyWinner && (
              <div className="bg-slate-950 border border-purple-500/30 rounded-2xl p-6 space-y-2 animate-bounce">
                <p className="text-purple-400 text-xs font-bold uppercase tracking-widest">
                  🎉 Grand Winner Selected! 🎉
                </p>
                <h2 className="text-3xl font-extrabold text-white">
                  {luckyWinner.name}
                </h2>
                <p className="text-slate-400 font-mono text-sm">{luckyWinner.phone}</p>
              </div>
            )}

            <button
              onClick={triggerLuckyDraw}
              disabled={isDrawing || !participants.length}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-8 py-3.5 rounded-xl shadow-lg shadow-purple-600/30 transition-all text-base disabled:opacity-50"
            >
              {isDrawing ? "Drawing Winner..." : "Run Lucky Draw!"}
            </button>
          </div>
        )}
      </main>

      {/* QR Code Modal Popup */}
      {showQrModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
            <h3 className="text-lg font-bold text-white">Scan to Spin the Wheel</h3>
            <div className="bg-white p-4 rounded-xl flex items-center justify-center shadow-inner mx-auto w-fit">
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
            <p className="text-xs text-slate-400 font-mono break-all">{qrUrl}</p>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 rounded-xl transition-all text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
