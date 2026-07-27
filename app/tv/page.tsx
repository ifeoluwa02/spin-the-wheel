"use client";

import { useEffect, useState, useRef } from "react";
import type { Campaign, Participant } from "@/types";
import { getCampaign, getParticipants, DEFAULT_CAMPAIGN } from "@/lib/campaign";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { QRCodeSVG } from "qrcode.react";
import { Trophy, Flame, Sparkles, QrCode, Clock, Award, Activity, Zap, Radio } from "lucide-react";

export default function TvDisplayMode() {
  const [campaign, setCampaign] = useState<Campaign>(DEFAULT_CAMPAIGN);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [wheelUrl, setWheelUrl] = useState("");
  const [campaignSlug, setCampaignSlug] = useState("demo-campaign");
  const [latestWinner, setLatestWinner] = useState<Participant | null>(null);
  const [showWinnerFlash, setShowWinnerFlash] = useState(false);
  const prevWinnersCountRef = useRef(0);
  const [currentTime, setCurrentTime] = useState("");

  // Resolve campaign slug from ?c= param
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("c") || process.env.NEXT_PUBLIC_CAMPAIGN_ID || "demo-campaign";
    setCampaignSlug(slug);
    setWheelUrl(`${window.location.origin}/?c=${slug}`);
  }, []);

  // Load campaign + live listener
  useEffect(() => {
    if (!campaignSlug) return;
    getCampaign(campaignSlug).then(setCampaign);
    getParticipants(campaignSlug).then(setParticipants);

    let unsub: (() => void) | undefined;
    try {
      const q = query(
        collection(db, "participants"),
        where("campaignId", "==", campaignSlug),
        orderBy("createdAt", "desc")
      );
      unsub = onSnapshot(q, (snap) => {
        const list: Participant[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Participant) }));
        if (list.length > 0) setParticipants(list);
      });
    } catch {
      const iv = setInterval(() => getParticipants(campaignSlug).then(setParticipants), 3000);
      return () => clearInterval(iv);
    }
    return () => { if (unsub) unsub(); };
  }, [campaignSlug]);

  // Detect new winners → flash banner
  useEffect(() => {
    const winners = participants.filter((p) => p.won);
    if (winners.length > prevWinnersCountRef.current && winners.length > 0) {
      setLatestWinner(winners[0]);
      setShowWinnerFlash(true);
      const t = setTimeout(() => setShowWinnerFlash(false), 6000);
      prevWinnersCountRef.current = winners.length;
      return () => clearTimeout(t);
    }
    prevWinnersCountRef.current = winners.length;
  }, [participants]);

  // Live clock
  useEffect(() => {
    const update = () =>
      setCurrentTime(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  const recentWinners = participants.filter((p) => p.won).slice(0, 10);
  const totalSpins = participants.length;
  const totalWinners = recentWinners.length;
  const winRate = totalSpins ? Math.round((participants.filter((p) => p.won).length / totalSpins) * 100) : 0;

  const gc = campaign.gradientStart || campaign.primaryColor || "#FF6B35";
  const g2 = campaign.gradientEnd || campaign.secondaryColor || "#00BFA6";

  return (
    <div
      className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden bg-[#070d14] text-white selection:bg-teal-500 selection:text-white"
      style={{ fontFamily: "Nunito, sans-serif" }}
    >
      {/* Dynamic Ambient Color Orbs */}
      <div
        className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[140px] opacity-20 pointer-events-none transition-all duration-1000"
        style={{ background: gc }}
      />
      <div
        className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full blur-[140px] opacity-20 pointer-events-none transition-all duration-1000"
        style={{ background: g2 }}
      />

      {/* Grid Pattern Overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* ── WINNER FLASH OVERLAY BANNER ── */}
      <div
        className={`relative z-50 w-full overflow-hidden transition-all duration-700 ease-out ${
          showWinnerFlash ? "max-h-24 opacity-100 py-3" : "max-h-0 opacity-0 py-0"
        }`}
        style={{
          background: `linear-gradient(90deg, ${gc}, ${g2}, ${gc})`,
          boxShadow: `0 10px 30px ${gc}40`,
        }}
      >
        {latestWinner && (
          <div className="flex items-center justify-center gap-3 px-6 text-center">
            <Sparkles className="w-6 h-6 text-yellow-300 animate-bounce flex-shrink-0" />
            <div className="flex items-center gap-2 truncate">
              <span className="text-xs sm:text-sm font-black uppercase tracking-[0.25em] text-white/80">
                🎉 WINNER ANNOUNCEMENT:
              </span>
              <span className="text-base sm:text-xl font-black text-white truncate" style={{ fontFamily: "Rubik, sans-serif" }}>
                {latestWinner.name}
              </span>
              <span className="text-xs sm:text-base font-bold text-white/90 truncate">
                won <span className="underline decoration-yellow-300 underline-offset-4">{latestWinner.prizeLabel}</span>!
              </span>
            </div>
            <Sparkles className="w-6 h-6 text-yellow-300 animate-bounce flex-shrink-0" />
          </div>
        )}
      </div>

      {/* ── TOP STAGE HEADER ── */}
      <header className="relative z-30 w-full flex flex-wrap items-center justify-between gap-4 px-6 sm:px-12 py-5 border-b border-white/10 bg-black/30 backdrop-blur-2xl">
        {/* Brand identity */}
        <div className="flex items-center gap-4 min-w-0">
          {campaign.logoUrl ? (
            <img
              src={campaign.logoUrl}
              alt={campaign.name}
              className="h-12 sm:h-16 w-auto object-contain flex-shrink-0 drop-shadow-xl"
            />
          ) : (
            <div
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-2xl"
              style={{ background: `linear-gradient(135deg, ${gc}, ${g2})` }}
            >
              🎡
            </div>
          )}
          <div className="min-w-0">
            <h1
              className="font-black text-white leading-tight truncate text-xl sm:text-3xl"
              style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}
            >
              {campaign.name}
            </h1>
            {campaign.subTitle && (
              <p
                className="font-bold uppercase tracking-[0.25em] text-xs truncate mt-0.5"
                style={{ color: g2 }}
              >
                {campaign.subTitle}
              </p>
            )}
          </div>
        </div>

        {/* Live Metrics & Clock */}
        <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
          {/* Metrics Pill Grid */}
          <div className="flex items-stretch divide-x divide-white/10 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden">
            {[
              { label: "Total Spins", value: totalSpins, color: "#ffffff", icon: Activity },
              { label: "Prizes Claimed", value: totalWinners, color: "#10b981", icon: Trophy },
              { label: "Win Rate", value: `${winRate}%`, color: gc, icon: Zap },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="px-5 sm:px-7 py-3 text-center flex flex-col justify-center">
                <div className="flex items-center justify-center gap-1.5">
                  <Icon className="w-4 h-4" style={{ color }} />
                  <p className="font-black font-mono text-xl sm:text-2xl leading-none text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                    {value}
                  </p>
                </div>
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mt-1 text-white/40">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Live Stream Indicator */}
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Radio className="w-4 h-4 animate-pulse text-emerald-400" />
            <span className="text-xs font-black uppercase tracking-widest">
              STAGE LIVE
            </span>
          </div>

          {/* Real-time Clock */}
          <div className="hidden lg:flex items-center gap-2 text-white/40 font-mono text-sm font-bold bg-white/[0.03] px-4 py-2.5 rounded-2xl border border-white/5">
            <Clock className="w-4 h-4 text-white/30" />
            {currentTime}
          </div>
        </div>
      </header>

      {/* ── MAIN STAGE CONTENT ── */}
      <main className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 px-6 sm:px-12 py-8 items-center max-w-7xl mx-auto w-full">

        {/* LEFT COLUMN: QR CODE STAGE CARD */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <div className="relative w-full max-w-sm sm:max-w-md flex flex-col items-center gap-6 rounded-3xl p-8 bg-white/[0.04] backdrop-blur-2xl border border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
            
            {/* Top Floating Ribbon Badge */}
            <div
              className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] text-white shadow-xl flex items-center gap-2 whitespace-nowrap"
              style={{ background: `linear-gradient(135deg, ${gc}, ${g2})` }}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Scan to Spin & Win</span>
            </div>

            {/* Glowing QR Frame */}
            <div className="relative w-full p-4 rounded-2xl bg-white shadow-2xl mt-2 group transition-transform hover:scale-[1.02]">
              {wheelUrl && (
                <QRCodeSVG
                  value={wheelUrl}
                  size={280}
                  level="H"
                  className="w-full h-auto rounded-lg"
                />
              )}
            </div>

            {/* Call to action instructions */}
            <div className="text-center space-y-2 w-full">
              <h2 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                Point Your Phone Camera
              </h2>
              <p className="text-sm text-white/60 leading-relaxed px-2">
                {campaign.welcomeMessage || "Scan the QR code to register on your phone, spin the wheel, and win instant prizes!"}
              </p>
            </div>

            {/* Campaign URL link badge */}
            <div className="w-full px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-center">
              <p className="text-xs font-mono text-teal-400 break-all leading-tight">
                {wheelUrl}
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE WINNER LEADERBOARD */}
        <div className="lg:col-span-7 flex flex-col gap-5 w-full h-full justify-center">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Recent Lucky Winners
                </h2>
                <p className="text-xs font-bold uppercase tracking-wider text-teal-400">
                  Real-time Activation Feed
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full text-xs font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Live Updates
            </span>
          </div>

          {/* Winner Cards List */}
          {recentWinners.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-12 rounded-3xl bg-white/[0.03] border border-white/5 gap-4">
              <Trophy className="w-16 h-16 text-white/20" />
              <div>
                <p className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Be the First Winner!
                </p>
                <p className="text-sm text-white/40 mt-1">
                  Scan the QR code on the left to spin the wheel on your phone.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[460px] overflow-y-auto pr-1">
              {recentWinners.map((winner, idx) => {
                const isFirst = idx === 0;
                const medalIcon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;

                return (
                  <div
                    key={winner.id || idx}
                    className={`flex items-center gap-4 rounded-2xl p-4 transition-all duration-500 ${
                      isFirst && showWinnerFlash
                        ? "bg-gradient-to-r from-teal-500/20 to-orange-500/20 border-teal-400/50 shadow-[0_0_30px_rgba(0,191,166,0.3)]"
                        : "bg-white/[0.04] hover:bg-white/[0.07] border-white/10"
                    } border backdrop-blur-xl`}
                  >
                    {/* Rank / Medal Avatar */}
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0 ${
                        isFirst
                          ? "bg-gradient-to-br from-amber-400/30 to-orange-500/30 border border-amber-400/50 text-amber-300"
                          : "bg-white/5 border border-white/10 text-white/40"
                      }`}
                    >
                      {medalIcon || <Award className="w-5 h-5 opacity-40" />}
                    </div>

                    {/* Winner Info */}
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-white truncate text-base sm:text-lg leading-tight" style={{ fontFamily: "Rubik, sans-serif" }}>
                        {winner.name}
                      </p>
                      <p className="text-xs sm:text-sm font-bold truncate text-teal-400 mt-0.5">
                        Won: {winner.prizeLabel}
                      </p>
                    </div>

                    {/* Time badge */}
                    <p className="text-xs font-mono text-white/30 flex-shrink-0">
                      {new Date(winner.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ── BROADCAST TICKER FOOTER ── */}
      <footer className="relative z-30 w-full flex items-center overflow-hidden bg-black/60 backdrop-blur-xl border-t border-white/10 h-12">
        {/* Static Left Brand Tag */}
        <div
          className="flex-shrink-0 h-full flex items-center px-6 text-white text-xs font-black uppercase tracking-widest z-10 shadow-lg"
          style={{ background: `linear-gradient(90deg, ${gc}, ${g2})` }}
        >
          ✦ LIVE BROADCAST
        </div>

        {/* Marquee Text Line */}
        <div className="flex-1 overflow-hidden relative">
          <div className="animate-marquee whitespace-nowrap flex items-center gap-12 text-xs font-bold text-white/60">
            <span>
              🎡 Scan the QR Code to Play &nbsp;·&nbsp; 🏆 {totalWinners} Prize{totalWinners !== 1 ? "s" : ""} Claimed &nbsp;·&nbsp; 🎲 {totalSpins} Total Spin{totalSpins !== 1 ? "s" : ""} &nbsp;·&nbsp; {campaign.welcomeMessage || `Win exciting prizes from ${campaign.name}!`}
            </span>
            <span>
              🎡 Scan the QR Code to Play &nbsp;·&nbsp; 🏆 {totalWinners} Prize{totalWinners !== 1 ? "s" : ""} Claimed &nbsp;·&nbsp; 🎲 {totalSpins} Total Spin{totalSpins !== 1 ? "s" : ""} &nbsp;·&nbsp; {campaign.welcomeMessage || `Win exciting prizes from ${campaign.name}!`}
            </span>
          </div>
        </div>

        {/* Right Clock Footer */}
        <div className="flex-shrink-0 h-full hidden sm:flex items-center px-6 font-mono text-xs font-bold text-white/40 border-l border-white/10 bg-black/40">
          {currentTime}
        </div>
      </footer>
    </div>
  );
}
