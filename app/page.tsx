"use client";

import { useEffect, useState } from "react";
import type { Campaign, Prize } from "@/types";
import {
  getCampaign,
  hasAlreadySpun,
  recordParticipant,
  generateVoucherCode,
} from "@/lib/campaign";
import { pickPrizeIndex } from "@/lib/pickPrize";
import RegistrationForm, { RegistrationValues } from "@/components/RegistrationForm";
import SpinWheel from "@/components/SpinWheel";
import WinnerModal from "@/components/WinnerModal";
import Link from "next/link";
import { Settings, Loader2, WifiOff, ChevronRight, RotateCcw } from "lucide-react";

type Step = "loading" | "not-found" | "register" | "wheel" | "already-spun";

export default function Home() {
  const [step, setStep] = useState<Step>("loading");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [participant, setParticipant] = useState<RegistrationValues | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [spinToken, setSpinToken] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState<Prize | null>(null);
  const [voucherCode, setVoucherCode] = useState<string>("");
  const [activeStoreCode, setActiveStoreCode] = useState<string>("");
  const [activeStoreName, setActiveStoreName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    let targetCampaignId = process.env.NEXT_PUBLIC_CAMPAIGN_ID || "";
    let storeCodeParam = "";

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const queryId = params.get("c");
      if (queryId) targetCampaignId = queryId;
      storeCodeParam = params.get("store") || "";
      setActiveStoreCode(storeCodeParam);
    }

    getCampaign(targetCampaignId).then((c) => {
      if (cancelled) return;
      if (!c || !c.active || !c.prizes?.length) { setStep("not-found"); return; }
      setCampaign(c);

      if (storeCodeParam && c.stores?.length) {
        const matched = c.stores.find(s => s.code === storeCodeParam || s.id === storeCodeParam);
        if (matched) setActiveStoreName(matched.name);
        else setActiveStoreName(storeCodeParam);
      }

      setStep("register");
    });
    return () => { cancelled = true; };
  }, []);

  async function handleRegister(values: RegistrationValues) {
    if (!campaign) return;
    setSubmitting(true);
    setRegError(null);
    try {
      if (campaign.oneSpinPerPhone) {
        const already = await hasAlreadySpun(campaign.id, values.phone);
        if (already) { setStep("already-spun"); setSubmitting(false); return; }
      }
      setParticipant(values);
      setStep("wheel");
    } catch {
      setRegError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSpinClick() {
    if (!campaign || isSpinning) return;
    const idx = pickPrizeIndex(campaign.prizes);
    setTargetIndex(idx);
    setIsSpinning(true);
    setSpinToken((t) => t + 1);
  }

  async function handleFinish(prize: Prize) {
    setIsSpinning(false);
    const code = prize.isLosing ? "" : generateVoucherCode(prize.voucherPrefix || "SPIN");
    setVoucherCode(code);
    setWonPrize(prize);
    if (campaign && participant) {
      try {
        await recordParticipant({
          name: participant.name, phone: participant.phone, email: participant.email,
          campaignId: campaign.id, prizeId: prize.id, prizeLabel: prize.label,
          voucherCode: code, won: !prize.isLosing, createdAt: Date.now(),
          storeCode: activeStoreCode || undefined,
          storeName: activeStoreName || undefined,
        });
      } catch (err) { console.error("Failed to record participant", err); }
    }
  }

  function handleReset() {
    setWonPrize(null); setParticipant(null); setTargetIndex(null); setStep("register");
  }

  const gc = campaign?.gradientStart || campaign?.primaryColor || "#FF6B35";
  const g2 = campaign?.gradientEnd || campaign?.secondaryColor || "#00BFA6";

  return (
    <div
      className="relative min-h-screen w-full flex flex-col items-center overflow-x-hidden"
      style={{
        background: `radial-gradient(ellipse at 20% 0%, ${gc}35 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, ${g2}30 0%, transparent 50%), #070d14`,
        fontFamily: "Nunito, sans-serif",
      }}
    >
      {/* Grid texture */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      {/* Corner orbs */}
      <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full blur-3xl opacity-15 pointer-events-none" style={{ background: gc }} />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full blur-3xl opacity-15 pointer-events-none" style={{ background: g2 }} />

      {/* Discreet admin link */}
      <Link href="/admin" className="fixed top-4 right-4 z-50 p-2 rounded-xl transition-colors opacity-20 hover:opacity-60" style={{ color: "rgba(255,255,255,0.8)" }} title="Admin Portal">
        <Settings className="w-5 h-5" />
      </Link>

      {/* ── LOADING ── */}
      {step === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${gc}, ${g2})` }}>
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
          <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>Loading campaign…</p>
        </div>
      )}

      {/* ── NOT FOUND ── */}
      {step === "not-found" && (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-3xl p-8 text-center space-y-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}>
            <div className="text-5xl">📭</div>
            <div>
              <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Campaign Inactive</h1>
              <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>This promotional campaign is currently unavailable.</p>
            </div>
            <Link href="/admin" className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-black text-white transition-all hover:opacity-90"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
              Go to Admin Dashboard <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* ── BRAND HEADER (shown on register + wheel steps) ── */}
      {campaign && (step === "register" || step === "wheel" || step === "already-spun") && (
        <header className="relative z-10 w-full max-w-sm px-5 pt-12 pb-4 flex flex-col items-center gap-3 text-center">
          {campaign.logoUrl ? (
            <img
              src={campaign.logoUrl}
              alt={campaign.name}
              className="h-16 w-auto object-contain"
              style={{ filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5))" }}
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl shadow-2xl" style={{ background: `linear-gradient(135deg, ${gc}, ${g2})` }}>
              🎯
            </div>
          )}
          <div>
            <h1 className="text-2xl font-black text-white leading-tight" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>
              {campaign.name}
            </h1>
            {campaign.subTitle && (
              <p className="text-xs font-bold uppercase tracking-[0.2em] mt-1" style={{ color: g2 }}>{campaign.subTitle}</p>
            )}
          </div>
          {step === "register" && (
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>{campaign.welcomeMessage}</p>
          )}
        </header>
      )}

      {/* ── REGISTRATION FORM ── */}
      {step === "register" && campaign && (
        <main className="relative z-10 w-full max-w-sm px-5 pb-12 flex-1">
          <div className="rounded-3xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 32px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
            <div>
              <h2 className="text-lg font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Enter Your Details</h2>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>Register to spin the wheel for instant prizes.</p>
            </div>
            <RegistrationForm
              onSubmit={handleRegister}
              submitting={submitting}
              error={regError}
              accentColor={campaign.primaryColor || gc}
            />
          </div>
        </main>
      )}

      {/* ── ALREADY SPUN ── */}
      {step === "already-spun" && campaign && (
        <main className="relative z-10 w-full max-w-sm px-5 pb-12 flex-1 flex items-center">
          <div className="w-full rounded-3xl p-8 text-center space-y-5" style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-4xl">🔒</div>
            <div>
              <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Already Played</h1>
              <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.45)" }}>
                This phone number has already been used for a spin in this campaign.
              </p>
            </div>
            <button
              onClick={() => { setRegError(null); setStep("register"); }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black text-white transition-all hover:opacity-80"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <RotateCcw className="w-4 h-4" />
              Try a different number
            </button>
          </div>
        </main>
      )}

      {/* ── WHEEL STAGE ── */}
      {step === "wheel" && campaign && participant && (
        <main className="relative z-10 w-full max-w-sm px-4 pb-10 flex-1 flex flex-col items-center gap-6">
          <div className="text-center">
            <p className="text-lg font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
              Welcome, {participant.name}! 👋
            </p>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
              {isSpinning ? "Spinning…" : "Tap the button to spin!"}
            </p>
          </div>

          <SpinWheel
            prizes={campaign.prizes}
            targetIndex={targetIndex}
            spinToken={spinToken}
            onFinish={handleFinish}
            accentColor={campaign.primaryColor || gc}
            logoUrl={campaign.logoUrl}
          />

          <button
            onClick={handleSpinClick}
            disabled={isSpinning}
            className="w-full max-w-[280px] flex items-center justify-center gap-2.5 py-4 rounded-2xl font-black text-white text-base transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(135deg, ${gc}, ${gc}bb)`,
              boxShadow: `0 10px 30px ${gc}50`,
              fontFamily: "Rubik, sans-serif",
            }}
          >
            {isSpinning ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Spinning…</>
            ) : (
              <>🎡 Spin the Wheel!</>
            )}
          </button>
        </main>
      )}

      {/* ── RESULT MODAL ── */}
      {wonPrize && campaign && participant && (
        <WinnerModal
          prize={wonPrize}
          participantName={participant.name}
          voucherCode={voucherCode}
          campaignName={campaign.name}
          subTitle={campaign.subTitle}
          accentColor={campaign.primaryColor || gc}
          onClose={handleReset}
        />
      )}
    </div>
  );
}
