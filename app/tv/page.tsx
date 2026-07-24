"use client";

import { useEffect, useState } from "react";
import type { Campaign, Participant } from "@/types";
import { getCampaign, getParticipants, DEFAULT_CAMPAIGN } from "@/lib/campaign";
import { QRCodeSVG } from "qrcode.react";
import { Sparkles, Trophy, Flame } from "lucide-react";

export default function TvDisplayMode() {
  const [campaign, setCampaign] = useState<Campaign>(DEFAULT_CAMPAIGN);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => {
    async function loadData() {
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
    }
    loadData();

    // Auto-refresh every 5 seconds for live activation feeds
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const recentWinners = participants.filter((p) => p.won).slice(0, 8);
  const totalSpins = participants.length;
  const totalWinners = participants.filter((p) => p.won).length;

  const bgStyle = {
    background: `radial-gradient(circle at 20% 20%, ${
      campaign.gradientStart || "#FF6B35"
    } 0%, transparent 50%), radial-gradient(circle at 80% 80%, ${
      campaign.gradientEnd || "#00BFA6"
    } 0%, transparent 50%), #0D1B2A`,
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between p-12 text-white font-sans overflow-hidden"
      style={bgStyle}
    >
      {/* Header Bar */}
      <header className="flex items-center justify-between border-b border-white/20 pb-8">
        <div className="flex items-center gap-6">
          {campaign.logoUrl ? (
            <img
              src={campaign.logoUrl}
              alt={campaign.name}
              className="h-16 object-contain filter drop-shadow-lg"
            />
          ) : (
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center font-bold text-3xl">
              🎯
            </div>
          )}
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">
              {campaign.name}
            </h1>
            <p className="text-xl text-white/80 font-medium">
              {campaign.welcomeMessage}
            </p>
          </div>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-8 bg-black/30 backdrop-blur-xl border border-white/20 rounded-2xl px-8 py-4 shadow-2xl">
          <div className="text-center">
            <p className="text-xs uppercase font-bold tracking-widest text-white/60">
              Total Spins
            </p>
            <p className="text-3xl font-black text-white font-mono">{totalSpins}</p>
          </div>
          <div className="w-px h-10 bg-white/20" />
          <div className="text-center">
            <p className="text-xs uppercase font-bold tracking-widest text-emerald-400">
              Prizes Claimed
            </p>
            <p className="text-3xl font-black text-emerald-400 font-mono">
              {totalWinners}
            </p>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-center">
        {/* Left Column: QR Code Prompt */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center text-center space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-2xl border-4 border-white/40 transform hover:scale-105 transition-transform">
            <QRCodeSVG value={qrUrl} size={300} />
          </div>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-full px-5 py-2 text-sm font-bold tracking-wide uppercase">
              <Sparkles className="w-4 h-4 text-yellow-300" />
              <span>Scan QR Code on Mobile</span>
            </div>
            <h2 className="text-3xl font-black text-white">
              Scan Your Phone to Spin & Win!
            </h2>
          </div>
        </div>

        {/* Right Column: Live Winner Feed */}
        <div className="lg:col-span-7 bg-black/40 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <Flame className="w-6 h-6 text-orange-400" />
              <h3 className="text-2xl font-bold">Recent Lucky Winners</h3>
            </div>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full font-bold uppercase tracking-wider animate-pulse">
              ● Live Updates
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recentWinners.length === 0 ? (
              <p className="text-white/60 text-lg col-span-2 py-8 text-center">
                Be the first to spin and win! Scan the QR code.
              </p>
            ) : (
              recentWinners.map((winner, idx) => (
                <div
                  key={winner.id || idx}
                  className="bg-white/10 border border-white/20 backdrop-blur-md rounded-2xl p-4 flex items-center gap-4 animate-fadeIn"
                >
                  <div className="w-12 h-12 bg-amber-400/20 border border-amber-400/40 rounded-xl flex items-center justify-center text-amber-300 font-bold text-xl flex-shrink-0">
                    <Trophy className="w-6 h-6 text-amber-300" />
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="font-bold text-lg text-white truncate">
                      {winner.name}
                    </h4>
                    <p className="text-amber-300 font-semibold text-sm truncate">
                      Won: {winner.prizeLabel}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="flex items-center justify-between text-white/60 text-sm border-t border-white/10 pt-6">
        <span>Experiential Activation Screen — {campaign.name}</span>
        <span>Powered by Spin & Win</span>
      </footer>
    </div>
  );
}
