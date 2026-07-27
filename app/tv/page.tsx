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
  const [wheelUrl, setWheelUrl] = useState("");
  const [campaignSlug, setCampaignSlug] = useState("demo-campaign");
  const [tick, setTick] = useState(0);
  const [latestWinner, setLatestWinner] = useState<Participant | null>(null);
  const [showWinnerFlash, setShowWinnerFlash] = useState(false);
  const prevWinnersCountRef = useRef(0);
  const [currentTime, setCurrentTime] = useState("");
  const [qrSize, setQrSize] = useState(200);
  const qrRef = useRef<HTMLDivElement>(null);

  // Resolve campaign slug from ?c= param
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("c") || process.env.NEXT_PUBLIC_CAMPAIGN_ID || "demo-campaign";
    setCampaignSlug(slug);
    setWheelUrl(`${window.location.origin}/?c=${slug}`);
  }, []);

  // Responsive QR code size
  useEffect(() => {
    function updateQrSize() {
      if (qrRef.current) {
        const w = qrRef.current.offsetWidth;
        setQrSize(Math.max(120, Math.min(w - 32, 300)));
      }
    }
    updateQrSize();
    window.addEventListener("resize", updateQrSize);
    return () => window.removeEventListener("resize", updateQrSize);
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
      const t = setTimeout(() => setShowWinnerFlash(false), 5000);
      prevWinnersCountRef.current = winners.length;
      return () => clearTimeout(t);
    }
    prevWinnersCountRef.current = winners.length;
  }, [participants]);

  // Ticker animation
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 50);
    return () => clearInterval(iv);
  }, []);

  // Live clock
  useEffect(() => {
    const update = () =>
      setCurrentTime(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  const recentWinners = participants.filter((p) => p.won).slice(0, 10);
  const totalSpins = participants.length;
  const totalWinners = recentWinners.length;
  const winRate = totalSpins ? Math.round((participants.filter((p) => p.won).length / totalSpins) * 100) : 0;

  const gc = campaign.gradientStart || "#FF6B35";
  const g2 = campaign.gradientEnd || "#00BFA6";

  return (
    <div
      className="relative min-h-screen w-full flex flex-col overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse at 15% 20%, ${gc}40 0%, transparent 45%),
          radial-gradient(ellipse at 85% 80%, ${g2}40 0%, transparent 45%),
          #0A1628
        `,
        fontFamily: "Nunito, sans-serif",
      }}
    >
      {/* Grid texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Corner glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: gc }} />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: g2 }} />

      {/* ── WINNER FLASH BANNER ── */}
      <div
        className="relative z-50 w-full text-white text-center overflow-hidden transition-all duration-700 ease-out"
        style={{
          maxHeight: showWinnerFlash ? "80px" : "0px",
          background: `linear-gradient(90deg, ${gc}, ${g2}, ${gc})`,
          backgroundSize: "200% 100%",
        }}
      >
        {latestWinner && (
          <div className="flex items-center justify-center gap-3 py-3 px-4">
            <span className="text-xl">🎉</span>
            <p
              className="font-black text-sm sm:text-base md:text-xl truncate"
              style={{ fontFamily: "Rubik, sans-serif" }}
            >
              New Winner! &nbsp;<span className="opacity-90">{latestWinner.name}</span>
              &nbsp;—&nbsp;
              <span className="opacity-80">{latestWinner.prizeLabel}</span>
            </p>
            <span className="text-xl">🎉</span>
          </div>
        )}
      </div>

      {/* ── HEADER ── */}
      <header
        className="relative z-30 w-full flex flex-wrap items-center justify-between gap-4 px-4 sm:px-8 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {campaign.logoUrl ? (
            <img
              src={campaign.logoUrl}
              alt={campaign.name}
              className="h-10 sm:h-12 md:h-14 w-auto object-contain flex-shrink-0"
              style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}
            />
          ) : (
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center text-xl sm:text-2xl flex-shrink-0 shadow-xl"
              style={{ background: `linear-gradient(135deg, ${gc}, ${g2})` }}
            >
              🎯
            </div>
          )}
          <div className="min-w-0">
            <h1
              className="font-black text-white leading-tight truncate text-base sm:text-xl md:text-2xl lg:text-3xl"
              style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}
            >
              {campaign.name}
            </h1>
            {campaign.subTitle && (
              <p
                className="font-bold uppercase tracking-widest text-[10px] sm:text-xs truncate"
                style={{ color: g2 }}
              >
                {campaign.subTitle}
              </p>
            )}
          </div>
        </div>

        {/* Stats + Live */}
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-end">
          {/* Stat pills */}
          <div
            className="flex items-stretch divide-x rounded-xl overflow-hidden"
            style={{
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {[
              { label: "Spins", value: totalSpins, color: "#fff" },
              { label: "Won", value: totalWinners, color: "#10b981" },
              { label: "Rate", value: `${winRate}%`, color: gc },
            ].map(({ label, value, color }) => (
              <div key={label} className="px-3 sm:px-5 py-2 text-center" style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}>
                <p
                  className="font-black font-mono text-base sm:text-xl md:text-2xl leading-none"
                  style={{ color, fontFamily: "Rubik, sans-serif" }}
                >
                  {value}
                </p>
                <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Live pill */}
          <div
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}
          >
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-pulse" style={{ background: "#10b981" }} />
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest" style={{ color: "#10b981" }}>
              Live
            </span>
          </div>

          {/* Clock */}
          <p className="text-xs sm:text-sm font-mono font-bold hidden sm:block" style={{ color: "rgba(255,255,255,0.3)" }}>
            {currentTime}
          </p>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-center gap-6 sm:gap-8 lg:gap-12 px-4 sm:px-8 lg:px-12 py-6 sm:py-8">

        {/* ── QR CODE PANEL ── */}
        <div className="w-full lg:w-auto flex-shrink-0 flex justify-center">
          <div
            ref={qrRef}
            className="w-full max-w-xs sm:max-w-sm lg:max-w-none lg:w-72 xl:w-80 2xl:w-96 flex flex-col items-center gap-4 rounded-2xl sm:rounded-3xl p-5 sm:p-6 xl:p-8 relative"
            style={{
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            {/* Top badge */}
            <div
              className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest text-white shadow-lg whitespace-nowrap"
              style={{ background: `linear-gradient(135deg, ${gc}, ${g2})` }}
            >
              ✦ Scan to Play ✦
            </div>

            {/* QR code */}
            <div
              className="w-full rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl"
              style={{ padding: "12px", background: "#FFFFFF" }}
            >
              {wheelUrl && (
                <QRCodeSVG
                  value={wheelUrl}
                  size={qrSize}
                  level="H"
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              )}
            </div>

            {/* CTA text */}
            <div className="text-center space-y-1.5 w-full">
              <p
                className="font-black text-white text-lg sm:text-xl xl:text-2xl"
                style={{ fontFamily: "Rubik, sans-serif" }}
              >
                Spin & Win! 🎡
              </p>
              <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                {campaign.welcomeMessage || "Point your camera at the QR code, register, and spin for an instant prize!"}
              </p>
            </div>

            {/* URL display */}
            <div
              className="w-full rounded-xl px-3 py-2 text-center"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="text-[10px] sm:text-xs font-mono break-all leading-relaxed" style={{ color: g2 }}>
                {wheelUrl}
              </p>
            </div>

            {/* Animated dots */}
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full transition-opacity duration-300"
                  style={{
                    background: g2,
                    opacity: (tick + i * 4) % 12 < 6 ? 1 : 0.2,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── WINNERS FEED ── */}
        <div className="w-full flex-1 flex flex-col gap-4 sm:gap-5 min-w-0">
          {/* Feed title */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center text-sm sm:text-lg flex-shrink-0"
                style={{ background: `${gc}25`, border: `1px solid ${gc}30` }}
              >
                🏆
              </div>
              <div>
                <h2
                  className="font-black text-white text-base sm:text-xl md:text-2xl leading-tight"
                  style={{ fontFamily: "Rubik, sans-serif" }}
                >
                  Lucky Winners
                </h2>
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider" style={{ color: g2 }}>
                  Real-time · Live Feed
                </p>
              </div>
            </div>
            <div
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-black"
              style={{ background: "rgba(0,0,0,0.4)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {totalWinners} winner{totalWinners !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Winners grid / list */}
          {recentWinners.length === 0 ? (
            <div
              className="flex-1 flex flex-col items-center justify-center text-center rounded-2xl sm:rounded-3xl p-8 sm:p-12 gap-4"
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <span className="text-4xl sm:text-6xl">🎡</span>
              <div>
                <p
                  className="text-lg sm:text-2xl font-black text-white"
                  style={{ fontFamily: "Rubik, sans-serif" }}
                >
                  No winners yet!
                </p>
                <p className="text-sm sm:text-base mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Scan the QR code to register and be the first to spin!
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-2.5 sm:gap-3">
              {recentWinners.map((winner, idx) => {
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
                const isNewest = idx === 0 && showWinnerFlash;
                return (
                  <div
                    key={winner.id || idx}
                    className="flex items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl p-3 sm:p-4 transition-all duration-500"
                    style={{
                      background: isNewest
                        ? `linear-gradient(135deg, ${gc}20, ${g2}20)`
                        : "rgba(255,255,255,0.04)",
                      border: isNewest
                        ? `1px solid ${g2}50`
                        : "1px solid rgba(255,255,255,0.07)",
                      backdropFilter: "blur(12px)",
                      boxShadow: isNewest ? `0 0 24px ${g2}25` : "none",
                    }}
                  >
                    {/* Avatar / medal */}
                    <div
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center text-base sm:text-xl font-black flex-shrink-0"
                      style={{
                        background: medal
                          ? `linear-gradient(135deg, ${gc}40, ${g2}40)`
                          : "rgba(255,255,255,0.06)",
                        border: medal
                          ? `1px solid ${g2}40`
                          : "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.3)",
                        fontFamily: "Rubik, sans-serif",
                      }}
                    >
                      {medal || (
                        <span className="text-xs sm:text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                          {idx + 1}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p
                        className="font-black text-white truncate text-sm sm:text-base md:text-lg leading-tight"
                        style={{ fontFamily: "Rubik, sans-serif" }}
                      >
                        {winner.name}
                      </p>
                      <p
                        className="text-xs sm:text-sm font-bold truncate mt-0.5"
                        style={{ color: g2 }}
                      >
                        {winner.prizeLabel}
                      </p>
                    </div>

                    {/* Time */}
                    <p
                      className="text-[10px] sm:text-xs font-mono flex-shrink-0 hidden sm:block"
                      style={{ color: "rgba(255,255,255,0.25)" }}
                    >
                      {new Date(winner.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ── FOOTER TICKER ── */}
      <footer
        className="relative z-30 w-full flex items-center overflow-hidden flex-shrink-0"
        style={{
          height: "44px",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Static left badge */}
        <div
          className="flex-shrink-0 h-full flex items-center px-4 sm:px-5 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest"
          style={{ background: `linear-gradient(90deg, ${gc}, ${g2})` }}
        >
          ✦ LIVE
        </div>

        {/* Scrolling text */}
        <div className="flex-1 overflow-hidden relative">
          <div
            className="flex items-center gap-12 whitespace-nowrap absolute inset-y-0"
            style={{
              transform: `translateX(${-(tick * 0.5) % 700}px)`,
              color: "rgba(255,255,255,0.55)",
              fontSize: "12px",
              fontWeight: 700,
              alignItems: "center",
            }}
          >
            {[...Array(6)].map((_, i) => (
              <span key={i}>
                🎡 Scan the QR Code to play &nbsp;·&nbsp;
                🏆 {participants.filter(p => p.won).length} prize{participants.filter(p => p.won).length !== 1 ? "s" : ""} claimed &nbsp;·&nbsp;
                🎲 {totalSpins} total spin{totalSpins !== 1 ? "s" : ""} &nbsp;·&nbsp;
                {campaign.welcomeMessage || `Win amazing prizes from ${campaign.name}!`}
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              </span>
            ))}
          </div>
        </div>

        {/* Right clock */}
        <div
          className="flex-shrink-0 h-full hidden sm:flex items-center px-4 font-mono text-xs font-bold"
          style={{ color: "rgba(255,255,255,0.3)", borderLeft: "1px solid rgba(255,255,255,0.07)" }}
        >
          {currentTime}
        </div>
      </footer>
    </div>
  );
}
