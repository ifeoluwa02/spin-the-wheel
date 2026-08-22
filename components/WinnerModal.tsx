"use client";

import { useEffect, useState } from "react";
import type { Prize } from "@/types";
import { playWinSound, playLossSound } from "@/lib/audio";
import { Copy, CheckCircle2, Ticket, Trophy, RefreshCw, Frown } from "lucide-react";
import confetti from "canvas-confetti";

interface WinnerModalProps {
  prize: Prize;
  participantName: string;
  voucherCode: string;
  campaignName: string;
  subTitle?: string;
  accentColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  onClose: () => void;
}

export default function WinnerModal({
  prize,
  participantName,
  voucherCode,
  campaignName,
  subTitle,
  accentColor = "#00BFA6",
  secondaryColor = "#FF6B35",
  backgroundColor = "#070d14",
  onClose,
}: WinnerModalProps) {
  const won = !prize.isLosing;
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const t = setTimeout(() => setVisible(true), 30);

    if (won) {
      playWinSound();
      try {
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.55 }, colors: ["#ffffff", accentColor, secondaryColor, "#eab308"] });
        setTimeout(() => confetti({ particleCount: 50, spread: 50, origin: { y: 0.3, x: 0.2 }, colors: ["#ffffff", accentColor] }), 400);
        setTimeout(() => confetti({ particleCount: 50, spread: 50, origin: { y: 0.3, x: 0.8 }, colors: [secondaryColor, "#eab308"] }), 600);
      } catch {}
    } else {
      playLossSound();
    }
    return () => clearTimeout(t);
  }, [won, accentColor, secondaryColor]);

  function handleCopy() {
    if (!voucherCode) return;
    navigator.clipboard.writeText(voucherCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 overflow-y-auto transition-all duration-500"
      style={{
        background: won
          ? `radial-gradient(ellipse at 50% 0%, ${accentColor}40 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, ${secondaryColor}35 0%, transparent 60%), ${backgroundColor || "#070d14"}`
          : `radial-gradient(ellipse at 50% 0%, ${accentColor}20 0%, transparent 60%), ${backgroundColor || "#070d14"}`,
        fontFamily: "Nunito, sans-serif",
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0.96)",
      }}
    >
      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      {/* Corner glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-64 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: won ? accentColor : "rgba(100,100,120,0.5)" }} />

      <div className="relative z-10 w-full max-w-sm space-y-4 py-8">

        {/* Toast badge */}
        <div className="flex justify-center">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest text-white shadow-lg"
            style={{ background: won ? `linear-gradient(135deg, ${accentColor}, ${accentColor}bb)` : "rgba(255,255,255,0.1)", boxShadow: won ? `0 4px 16px ${accentColor}50` : "none" }}
          >
            {won ? <Trophy className="w-3.5 h-3.5" /> : <Frown className="w-3.5 h-3.5 opacity-60" />}
            {won ? `${participantName} Won!` : "Keep trying!"}
          </div>
        </div>

        {/* Hero prize name */}
        <div className="text-center px-2">
          <h1
            className="font-black text-white leading-none"
            style={{
              fontFamily: "Rubik, sans-serif",
              fontSize: "clamp(2.5rem, 10vw, 4rem)",
              letterSpacing: "-0.03em",
              textShadow: won ? `0 0 40px ${accentColor}80` : "none",
            }}
          >
            {won ? prize.label : "Try Again"}
          </h1>
        </div>

        {/* Main card */}
        <div
          className="rounded-3xl p-6 space-y-2 text-center"
          style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(20px)",
            border: won ? `1px solid ${accentColor}30` : "1px solid rgba(255,255,255,0.08)",
            boxShadow: won ? `0 0 60px ${accentColor}15, inset 0 1px 0 rgba(255,255,255,0.08)` : "inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <p className="text-xs font-black uppercase tracking-[0.25em]" style={{ color: won ? accentColor : "rgba(255,255,255,0.3)" }}>
            {won ? "🎉 CONGRATULATIONS!" : "SO CLOSE!"}
          </p>
          <h2
            className="text-2xl font-black text-white leading-tight"
            style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}
          >
            {prize.label}
          </h2>
          {!won && (
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
              Thank you for participating in <strong className="text-white">{campaignName}</strong>. Better luck next time!
            </p>
          )}
        </div>

        {/* Voucher card (winners only) */}
        {won && voucherCode && (
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accentColor}20` }}>
                <Ticket className="w-4 h-4" style={{ color: accentColor }} />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Your Voucher Code
              </p>
            </div>

            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-between px-5 py-4 rounded-xl font-mono font-black text-white text-lg tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] group"
              style={{
                background: `${accentColor}18`,
                border: `2px dashed ${accentColor}40`,
              }}
              title="Click to copy"
            >
              <span>{voucherCode}</span>
              {copied
                ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: accentColor }} />
                : <Copy className="w-5 h-5 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
              }
            </button>

            <p className="text-center text-xs font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
              {copied ? "✓ Copied to clipboard!" : "Tap to copy · Show this code to claim your prize"}
            </p>
          </div>
        )}

        {/* Sub-brand label */}
        <p className="text-center text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.2)" }}>
          {subTitle || campaignName}
        </p>

        {/* CTA button */}
        <button
          onClick={onClose}
          className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-black text-sm transition-all hover:opacity-80 active:scale-[0.98] group"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.7)",
            fontFamily: "Rubik, sans-serif",
          }}
        >
          <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          Done — Back to Home
        </button>
      </div>
    </div>
  );
}
