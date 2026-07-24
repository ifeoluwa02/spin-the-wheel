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
  Tv,
  ExternalLink,
  Settings,
  Lock,
  LogOut,
  Layers,
  Search,
  CheckCircle,
  XCircle,
} from "lucide-react";

export default function SuperAdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [globalParticipants, setGlobalParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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
      if (typeof window !== "undefined") {
        sessionStorage.setItem("super_admin_authed", "true");
      }
      setPinError(false);
    } else {
      setPinError(true);
    }
  }

  function handleLogout() {
    setAuthenticated(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("super_admin_authed");
    }
  }

  async function toggleCampaignActive(campaign: Campaign) {
    const updated = { ...campaign, active: !campaign.active };
    await updateCampaign(updated);
    setCampaigns((prev) =>
      prev.map((c) => (c.id === campaign.id ? updated : c))
    );
  }

  // Export ALL global data to CSV
  function exportGlobalCSV() {
    if (!globalParticipants.length) return;
    const headers = [
      "Campaign ID",
      "Name",
      "Phone",
      "Email",
      "Prize Won",
      "Voucher Code",
      "Status",
      "Date & Time",
    ];
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

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `agency_master_all_participants.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 font-sans">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6"
        >
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-gradient-to-tr from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto text-slate-950 font-bold shadow-lg">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-white">Agency Super Admin</h1>
            <p className="text-slate-400 text-xs">
              Master control panel to monitor all brand campaigns (Master PIN: 9999)
            </p>
          </div>

          <div className="space-y-2">
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Enter Master PIN"
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-4 py-3 text-center text-xl tracking-widest text-white outline-none font-mono"
              autoFocus
            />
            {pinError && (
              <p className="text-red-400 text-xs text-center font-medium">
                Incorrect Master PIN. Try 9999.
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-extrabold py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20"
          >
            Unlock Master Dashboard
          </button>
        </form>
      </div>
    );
  }

  const totalCampaigns = campaigns.length;
  const totalGlobalSpins = globalParticipants.length;
  const totalGlobalWinners = globalParticipants.filter((p) => p.won).length;
  const globalWinRate = totalGlobalSpins
    ? Math.round((totalGlobalWinners / totalGlobalSpins) * 100)
    : 0;

  const filteredCampaigns = campaigns.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.subTitle && c.subTitle.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-orange-500 rounded-xl flex items-center justify-center font-bold text-slate-950 shadow-md">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white leading-tight">
                Agency Master Portal
              </h1>
              <p className="text-xs text-slate-400">Super Admin Campaign Overview</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/create-campaign"
              className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md shadow-teal-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Host New Campaign</span>
            </Link>

            <button
              onClick={exportGlobalCSV}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3.5 py-2 rounded-xl border border-slate-700 transition-all font-semibold"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Export All Data</span>
            </button>

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
      <main className="max-w-7xl mx-auto px-4 pt-8 space-y-8">
        {/* Metric Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Total Hosted Campaigns
            </p>
            <h3 className="text-3xl font-bold text-amber-400 font-mono">
              {totalCampaigns}
            </h3>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Global Attendees & Spins
            </p>
            <h3 className="text-3xl font-bold text-teal-400 font-mono">
              {totalGlobalSpins}
            </h3>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Total Prize Winners
            </p>
            <h3 className="text-3xl font-bold text-emerald-400 font-mono">
              {totalGlobalWinners}
            </h3>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Agency Win Percentage
            </p>
            <h3 className="text-3xl font-bold text-orange-400 font-mono">
              {globalWinRate}%
            </h3>
          </div>
        </div>

        {/* Campaigns Directory */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Hosted Campaigns Directory</h2>
              <p className="text-xs text-slate-400">
                Manage, monitor, and launch activation links across all clients.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search campaign name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none w-60"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3">Campaign Name & ID</th>
                  <th className="p-3">Sub-Brand</th>
                  <th className="p-3">Prizes</th>
                  <th className="p-3">Spins</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      No campaigns found matching your query.
                    </td>
                  </tr>
                ) : (
                  filteredCampaigns.map((c) => {
                    const campaignSpins = globalParticipants.filter(
                      (p) => p.campaignId === c.id
                    ).length;

                    return (
                      <tr key={c.id} className="hover:bg-slate-950/50">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            {c.logoUrl ? (
                              <img
                                src={c.logoUrl}
                                alt={c.name}
                                className="w-8 h-8 object-contain rounded-lg bg-slate-950 p-1 border border-slate-800"
                              />
                            ) : (
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                                style={{ background: c.primaryColor || "#00BFA6" }}
                              >
                                🎯
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-white text-sm">{c.name}</p>
                              <p className="font-mono text-xs text-teal-400">
                                id: {c.id}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="p-3 font-semibold text-slate-300">
                          {c.subTitle || "-"}
                        </td>

                        <td className="p-3 font-mono font-semibold text-slate-400">
                          {c.prizes.length} segments
                        </td>

                        <td className="p-3 font-mono font-bold text-amber-400">
                          {campaignSpins} spins
                        </td>

                        <td className="p-3">
                          <button
                            onClick={() => toggleCampaignActive(c)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer border ${
                              c.active
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-red-500/10 text-red-400 border-red-500/20"
                            }`}
                          >
                            {c.active ? (
                              <>
                                <CheckCircle className="w-3 h-3" /> Active
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3" /> Paused
                              </>
                            )}
                          </button>
                        </td>

                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/?c=${c.id}`}
                              target="_blank"
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700"
                              title="Open Attendee Wheel"
                            >
                              <span>Wheel</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>

                            <Link
                              href={`/admin?c=${c.id}`}
                              target="_blank"
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700"
                              title="Open Brand Admin"
                            >
                              <span>Admin</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>

                            <Link
                              href={`/tv?c=${c.id}`}
                              target="_blank"
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-orange-300 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700"
                              title="Open TV Stage View"
                            >
                              <span>TV</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
