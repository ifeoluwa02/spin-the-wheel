"use client";

import { useEffect, useState } from "react";
import type { Prize } from "@/types";
import { playWinSound, playLossSound } from "@/lib/audio";
import { Check, Copy, CheckCircle2, Ticket } from "lucide-react";
import confetti from "canvas-confetti";

interface WinnerModalProps {
  prize: Prize;
  participantName: string;
  voucherCode: string;
  campaignName: string;
  subTitle?: string;
  accentColor?: string;
  onClose: () => void;
}

export default function WinnerModal({
  prize,
  participantName,
  voucherCode,
  campaignName,
  subTitle,
  onClose,
}: WinnerModalProps) {
  const won = !prize.isLosing;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (won) {
      playWinSound();
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#ffffff", "#3b82f6", "#f97316", "#eab308"],
        });
      } catch (e) {}
    } else {
      playLossSound();
    }
  }, [won]);

  function handleCopyVoucher() {
    if (!voucherCode) return;
    navigator.clipboard.writeText(voucherCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="winner-screen-overlay" role="dialog" aria-modal="true">
      {/* Background Graphic Lines Effect */}
      <div className="gradient-background-circles" />

      <div className="winner-screen-content">
        {/* Top Floating Winner Toast Badge */}
        <div className="top-winner-toast">
          <div className="toast-check-icon">
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </div>
          <span className="toast-text">
            {participantName} {won ? `won: ${prize.label}!` : `spun the wheel`}
          </span>
        </div>

        {/* Main Giant Hero Prize Text */}
        <h1 className="hero-prize-title">{won ? prize.label : "Try Again"}</h1>

        {/* Upper Glass Card */}
        <div className="glass-card congratulations-card">
          <p className="card-eyebrow">
            {won ? "CONGRATULATIONS!" : "SO CLOSE!"}
          </p>
          <h2 className="card-prize-name">{prize.label}</h2>
        </div>

        {/* Voucher Code Container */}
        {won ? (
          <div className="glass-card voucher-card">
            <div className="voucher-card-header">
              <Ticket className="voucher-icon" />
              <span className="voucher-eyebrow">VOUCHER CODE</span>
            </div>

            <button
              onClick={handleCopyVoucher}
              className="voucher-code-pill"
              title="Click to copy voucher code"
            >
              <span>{voucherCode}</span>
              {copied ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4 opacity-60 hover:opacity-100 transition-opacity" />
              )}
            </button>

            <p className="voucher-instruction">
              {copied ? "Code copied to clipboard!" : "Show this code to claim your prize"}
            </p>
          </div>
        ) : (
          <div className="glass-card voucher-card">
            <p className="voucher-instruction" style={{ marginTop: 8 }}>
              Thank you for participating in {campaignName}. Better luck next time!
            </p>
          </div>
        )}

        {/* Sub-brand label */}
        <p className="subbrand-text">{subTitle || campaignName}</p>

        {/* Primary Bottom Action Button */}
        <button className="done-dashboard-btn" onClick={onClose}>
          Done — Back to Home
        </button>
      </div>
    </div>
  );
}
