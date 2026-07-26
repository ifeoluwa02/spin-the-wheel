"use client";

import { useEffect, useState, useRef } from "react";
import type { Campaign, Participant } from "@/types";
import { getCampaign, getParticipants, DEFAULT_CAMPAIGN } from "@/lib/campaign";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { QRCodeSVG } from "qrcode.react";

export default function TvDisplayMode() {
  const [campaign, setCampaign] = useState<Campaign>(DEFAULT_CAMPAIGN);
  const [participants, setParticipants] = useState<Participant[]>([]);
  // The QR URL is campaign-specific — always points to /?c=slug
  const [wheelUrl, setWheelUrl] = useState("");
  const [campaignSlug, setCampaignSlug] = useState("demo-campaign");
  const [tick, setTick] = useState(0);
  const [latestWinner, setLatestWinner] = useState<Participant | null>(null);
  const [showWinnerFlash, setShowWinnerFlash] = useState(false);
  const prevWinnersCountRef = useRef(0);
  const [currentTime, setCurrentTime] = useState("");

  // Resolve campaign slug from ?c= param and build the correct campaign URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("c") || process.env.NEXT_PUBLIC_CAMPAIGN_ID || "demo-campaign";
    setCampaignSlug(slug);
    setWheelUrl(`${window.location.origin}/?c=${slug}`);
  }, []);

  // Load campaign config and set up live Firestore listener
  useEffect(() => {
    if (!campaignSlug) return;

    getCampaign(campaignSlug).then(setCampaign);
    getParticipants(campaignSlug).then(setParticipants);

    let unsubscribe: (() => void) | undefined;
    try {
      const q = query(
        collection(db, "participants"),
        where("campaignId", "==", campaignSlug),
        orderBy("createdAt", "desc")
      );
      unsubscribe = onSnapshot(q, (snap) => {
        const liveList: Participant[] = [];
        snap.forEach((docSnap) => {
          liveList.push({ id: docSnap.id, ...(docSnap.data() as Participant) });
        });
        if (liveList.length > 0) setParticipants(liveList);
      });
    } catch {
      // Polling fallback
      const iv = setInterval(() => getParticipants(campaignSlug).then(setParticipants), 3000);
      return () => clearInterval(iv);
    }

    return () => { if (unsubscribe) unsubscribe(); };
  }, [campaignSlug]);

  // Detect new winners and flash the latest one on screen
  useEffect(() => {
    const winners = participants.filter((p) => p.won);
    if (winners.length > prevWinnersCountRef.current && winners.length > 0) {
      setLatestWinner(winners[0]);
      setShowWinnerFlash(true);
      const t = setTimeout(() => setShowWinnerFlash(false), 5000);
      prevWinnersCountRef.current = winners.length;
      return () => clearTimeout(t);
    }
    prevWinnersCountRef.current = winners.length;
  }, [participants]);

  // Ticker for marquee animation cycling
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 50);
    return () => clearInterval(iv);
  }, []);

  // Live clock
  useEffect(() => {
    function update() {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  const recentWinners = participants.filter((p) => p.won).slice(0, 12);
  const totalSpins = participants.length;
  const totalWinners = participants.filter((p) => p.won).length;
  const winRate = totalSpins ? Math.round((totalWinners / totalSpins) * 100) : 0;

  const gc = campaign.gradientStart || "#FF6B35";
  const g2 = campaign.gradientEnd || "#00BFA6";

  return (
    <div
      className="fixed inset-0 overflow-hidden font-sans select-none"
      style={{
        background: `
          radial-gradient(ellipse at 15% 15%, ${gc}35 0%, transparent 45%),
          radial-gradient(ellipse at 85% 85%, ${g2}35 0%, transparent 45%),
          radial-gradient(ellipse at 50% 50%, ${gc}08 0%, transparent 70%),
          #0D1B2A
        `,
        fontFamily: "Nunito, sans-serif",
      }}
    >
      {/* Subtle animated grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />

      {/* Corner decorative orbs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ background: gc }} />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ background: g2 }} />

      {/* ── WINNER FLASH BANNER ── */}
      <div
        className="absolute inset-x-0 top-0 z-50 transition-all duration-700 ease-out"
        style={{
          transform: showWinnerFlash ? "translateY(0)" : "translateY(-100%)",
          background: `linear-gradient(90deg, ${gc}, ${g2})`,
          padding: "0 40px",
          height: showWinnerFlash ? "auto" : 0,
        }}
      >
        {latestWinner && (
          <div className="flex items-center justify-center gap-6 py-4">
            <span className="text-3xl">🎉</span>
            <div className="text-center">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-white/80">
                New Winner!
              </p>
              <p className="text-3xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>
                {latestWinner.name} — {latestWinner.prizeLabel}
              </p>
            </div>
            <span className="text-3xl">🎉</span>
          </div>
        )}
      </div>

      {/* ── HEADER ── */}
      <header
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-10 py-5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Brand identity */}
        <div className="flex items-center gap-5">
          {campaign.logoUrl ? (
            <img
              src={campaign.logoUrl}
              alt={campaign.name}
              className="h-14 w-auto object-contain"
              style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}
            />
          ) : (
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-xl"
              style={{ background: `linear-gradient(135deg, ${gc}, ${g2})` }}
            >
              🎯
            </div>
          )}
          <div>
            <h1
              className="text-3xl font-black text-white leading-tight"
              style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}
            >
              {campaign.name}
            </h1>
            {campaign.subTitle && (
              <p className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: g2 }}>
                {campaign.subTitle}
              </p>
            )}
          </div>
        </div>

        {/* Live counters */}
        <div
          className="flex items-stretch gap-0 rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {[
            { label: "Total Spins", value: totalSpins, color: "#ffffff" },
            { label: "Prizes Won", value: totalWinners, color: "#10b981" },
            { label: "Win Rate", value: `${winRate}%`, color: gc },
          ].map(({ label, value, color }, i) => (
            <div
              key={label}
              className="px-7 py-3 text-center"
              style={{
                borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.08)" : "none",
              }}
            >
              <p className="text-3xl font-black font-mono leading-none" style={{ color, fontFamily: "Rubik, sans-serif" }}>
                {value}
              </p>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Live clock + indicator */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#10b981" }} />
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: "#10b981" }}>
              Live
            </span>
          </div>
          <p className="text-sm font-mono font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>
            {currentTime}
          </p>
        </div>
      </header>

      {/* ── MAIN CONTENT AREA ── */}
      <main className="absolute inset-0 flex items-center px-10 gap-10" style={{ top: "90px", bottom: "70px" }}>

        {/* LEFT: QR Code panel */}
        <div className="w-[360px] flex-shrink-0 flex flex-col items-center gap-6">
          {/* QR frame */}
          <div
            className="relative w-full flex flex-col items-center"
            style={{
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "28px",
              padding: "32px 28px 28px",
              boxShadow: `0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.1)`,
            }}
          >
            {/* Decorative top badge */}
            <div
              className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] text-white shadow-lg"
              style={{ background: `linear-gradient(135deg, ${gc}, ${g2})` }}
            >
              ✦ Scan to Play ✦
            </div>

            {/* QR code — points to THIS campaign's wheel URL */}
            <div
              className="w-full rounded-2xl overflow-hidden shadow-2xl"
              style={{ padding: "16px", background: "#FFFFFF" }}
            >
              {wheelUrl && <QRCodeSVG value={wheelUrl} size={264} level="H" />}
            </div>

            <div className="mt-6 text-center space-y-1.5">
              <p
                className="text-2xl font-black text-white leading-tight"
                style={{ fontFamily: "Rubik, sans-serif" }}
              >
                Spin & Win
              </p>
              <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>
                {campaign.welcomeMessage || "Point your phone camera at the QR code to register and spin for an instant prize!"}
              </p>
              <div
                className="mt-3 px-4 py-2 rounded-xl text-xs font-mono break-all"
                style={{ background: "rgba(255,255,255,0.05)", color: g2, border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {wheelUrl}
              </div>
            </div>
          </div>

          {/* Pulse ring animation around QR */}
          <div className="flex gap-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{
                  background: g2,
                  opacity: (tick + i * 4) % 12 < 6 ? 1 : 0.2,
                  transition: "opacity 0.4s ease",
                }}
              />
            ))}
          </div>
        </div>

        {/* RIGHT: Winners feed */}
        <div className="flex-1 flex flex-col gap-6 h-full">

          {/* Feed header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ background: `${gc}25`, border: `1px solid ${gc}30` }}
              >
                🏆
              </div>
              <div>
                <h2
                  className="text-2xl font-black text-white leading-tight"
                  style={{ fontFamily: "Rubik, sans-serif" }}
                >
                  Lucky Winners
                </h2>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: g2 }}>
                  Real-time · Updated Live
                </p>
              </div>
            </div>

            <div
              className="px-4 py-2 rounded-xl text-sm font-black"
              style={{ background: "rgba(0,0,0,0.4)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {recentWinners.length}/{totalWinners} shown
            </div>
          </div>

          {/* Winners grid */}
          <div className="flex-1 overflow-hidden">
            {recentWinners.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                <div className="text-6xl">🎡</div>
                <div>
                  <p className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                    No winners yet!
                  </p>
                  <p className="text-base mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Be the first to scan the QR code, register and spin the wheel!
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 h-full content-start overflow-y-auto">
                {recentWinners.map((winner, idx) => (
                  <div
                    key={winner.id || idx}
                    className="rounded-2xl p-4 flex items-center gap-4 transition-all"
                    style={{
                      background: idx === 0 && showWinnerFlash
                        ? `linear-gradient(135deg, ${gc}30, ${g2}30)`
                        : "rgba(255,255,255,0.05)",
                      border: idx === 0 && showWinnerFlash
                        ? `1px solid ${g2}50`
                        : "1px solid rgba(255,255,255,0.08)",
                      backdropFilter: "blur(12px)",
                      boxShadow: idx === 0 && showWinnerFlash
                        ? `0 0 24px ${g2}30`
                        : "none",
                    }}
                  >
                    {/* Rank bubble */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0"
                      style={{
                        background: idx === 0 ? `linear-gradient(135deg, ${gc}50, ${g2}50)` : "rgba(255,255,255,0.06)",
                        border: idx === 0 ? `1px solid ${g2}40` : "1px solid rgba(255,255,255,0.08)",
                        color: idx === 0 ? "#FFD700" : "rgba(255,255,255,0.4)",
                      }}
                    >
                      {idx === 0 ? "🏆" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className="text-xl font-black text-white truncate leading-tight"
                        style={{ fontFamily: "Rubik, sans-serif" }}
                      >
                        {winner.name}
                      </p>
                      <p
                        className="text-sm font-bold truncate mt-0.5"
                        style={{ color: g2 }}
                      >
                        {winner.prizeLabel}
                      </p>
                      <p className="text-[11px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                        {new Date(winner.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── BOTTOM MARQUEE BAR ── */}
      <footer
        className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-0 overflow-hidden"
        style={{
          height: "52px",
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Left static brand tag */}
        <div
          className="flex-shrink-0 h-full flex items-center px-5 font-black text-sm"
          style={{
            background: `linear-gradient(90deg, ${gc}, ${g2})`,
            fontFamily: "Rubik, sans-serif",
            letterSpacing: "0.05em",
          }}
        >
          ✦ SPIN & WIN
        </div>

        {/* Scrolling marquee */}
        <div className="flex-1 overflow-hidden relative">
          <div
            className="flex items-center gap-16 whitespace-nowrap absolute"
            style={{
              transform: `translateX(${-(tick * 0.6) % 600}px) translateY(-50%)`,
              color: "rgba(255,255,255,0.6)",
              fontSize: "13px",
              fontWeight: 700,
              top: "50%",
              lineHeight: "52px",
            }}
          >
            {[...Array(5)].map((_, i) => (
              <span key={i}>
                🎡 Scan the QR Code to Play &nbsp;·&nbsp; 🏆 {totalWinners} Prize{totalWinners !== 1 ? "s" : ""} Claimed &nbsp;·&nbsp; 🎲 {totalSpins} Total Spin{totalSpins !== 1 ? "s" : ""} &nbsp;·&nbsp; {campaign.welcomeMessage || `Win exciting prizes from ${campaign.name}!`} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              </span>
            ))}
          </div>
        </div>

        {/* Right clock */}
        <div
          className="flex-shrink-0 h-full flex items-center px-5 font-mono text-sm font-bold"
          style={{ color: "rgba(255,255,255,0.4)", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
        >
          {currentTime}
        </div>
      </footer>
    </div>
  );
}
