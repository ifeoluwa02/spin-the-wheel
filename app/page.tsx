"use client";

import { useEffect, useState } from "react";
import type { Campaign, Prize } from "@/types";
import {
  getCampaign,
  hasAlreadySpun,
  recordParticipant,
  generateVoucherCode,
  getEffectivePrizes,
} from "@/lib/campaign";
import { pickPrizeIndex } from "@/lib/pickPrize";
import { getGradientContrastColor, getContrastTextColor, isLightColor, getAmbientGlowOpacity } from "@/lib/colors";
import { RotateCcw, Settings, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import RegistrationForm, { RegistrationValues } from "@/components/RegistrationForm";
import SpinWheel from "@/components/SpinWheel";
import WinnerModal from "@/components/WinnerModal";

type Step = "loading" | "not-found" | "register" | "already-spun" | "wheel";

export default function Home() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [participant, setParticipant] = useState<RegistrationValues | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [spinToken, setSpinToken] = useState(0);
  const [wonPrize, setWonPrize] = useState<Prize | null>(null);
  const [voucherCode, setVoucherCode] = useState("");
  const [activeStoreCode, setActiveStoreCode] = useState("");
  const [activeStoreName, setActiveStoreName] = useState("");

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
        const matched = c.stores.find(s => s.code?.toLowerCase() === storeCodeParam.toLowerCase() || s.id === storeCodeParam);
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
    // Use effective prizes (filtered by global + per-store pauses)
    const effective = getEffectivePrizes(campaign, activeStoreCode);
    const idx = pickPrizeIndex(effective);
    // Map back to the full prizes array index so SpinWheel can locate the right segment
    const fullIdx = campaign.prizes.findIndex((p) => p.id === effective[idx]?.id);
    setTargetIndex(fullIdx >= 0 ? fullIdx : idx);
    setSpinToken(Date.now());
    setIsSpinning(true);
  }

  async function handleFinish(prize: Prize) {
    setIsSpinning(false);
    const code = prize.isLosing ? "" : generateVoucherCode(prize.voucherPrefix || "SPIN");
    setVoucherCode(code);
    setWonPrize(prize);
    if (campaign && participant) {
      try {
        const resolvedStore = campaign.stores?.find(s => s.code?.toLowerCase() === (activeStoreCode || "").toLowerCase() || s.id === activeStoreCode);
        const finalStoreName = activeStoreName || resolvedStore?.name || (activeStoreCode ? activeStoreCode : "General Stage");

        const participantId = await recordParticipant({
          name: participant.name,
          phone: participant.phone,
          email: participant.email || "",
          ageRange: participant.ageRange || "",
          gender: participant.gender || "",
          campaignId: campaign.id,
          prizeId: prize.id,
          prizeLabel: prize.label,
          voucherCode: code,
          won: !prize.isLosing,
          createdAt: Date.now(),
          storeCode: activeStoreCode || "",
          storeName: finalStoreName,
        });
        console.log("Successfully recorded participant spin:", participantId);
      } catch (err) {
        console.error("Failed to record participant in Firestore:", err);
      }
    }
  }

  function handleReset() {
    setWonPrize(null); setParticipant(null); setTargetIndex(null); setStep("register");
  }

  const gc = campaign?.gradientStart || campaign?.primaryColor || "#FF6B35";
  const g2 = campaign?.gradientEnd || campaign?.secondaryColor || "#00BFA6";
  const bgColor = campaign?.backgroundColor || "#070d14";
  const spinBtnTextColor = getGradientContrastColor(gc, g2);
  const subTitleColor = isLightColor(g2) ? "#ffffff" : g2;
  const subTitleBg = isLightColor(g2) ? "rgba(255,255,255,0.15)" : `${g2}18`;
  const subTitleBorder = isLightColor(g2) ? "rgba(255,255,255,0.3)" : `${g2}35`;
  const nameHighlightColor = isLightColor(g2) ? "#ffffff" : g2;

  const orb1Opacity = getAmbientGlowOpacity(gc, 0.25);
  const orb2Opacity = getAmbientGlowOpacity(g2, 0.2);

  return (
    <div
      className="relative min-h-screen w-full flex flex-col items-center overflow-x-hidden transition-colors duration-700"
      style={{
        background: `radial-gradient(circle at 15% 10%, ${gc}35 0%, transparent 45%), radial-gradient(circle at 85% 20%, ${g2}30 0%, transparent 45%), radial-gradient(circle at 50% 65%, ${gc}20 0%, transparent 50%), radial-gradient(circle at 80% 95%, ${g2}25 0%, transparent 45%), ${bgColor}`,
        fontFamily: "Nunito, sans-serif",
      }}
    >
      {/* Dynamic ambient background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[120px] animate-pulse"
          style={{ background: gc, opacity: orb1Opacity, animationDuration: "8s" }}
        />
        <div
          className="absolute top-1/3 -right-32 w-96 h-96 rounded-full blur-[120px] animate-pulse"
          style={{ background: g2, opacity: orb2Opacity, animationDuration: "10s" }}
        />
        <div
          className="absolute -bottom-32 left-1/4 w-[500px] h-[500px] rounded-full blur-[140px] opacity-15"
          style={{ background: `radial-gradient(circle, ${gc}, ${g2})` }}
        />
      </div>

      {/* Grid texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Discreet admin link */}
      <Link href={`/admin${campaign?.id ? `?c=${campaign.id}` : ""}`} className="fixed top-4 right-4 z-50 p-2 rounded-xl transition-all opacity-30 hover:opacity-100 hover:scale-110" style={{ color: "rgba(255,255,255,0.8)" }} title="Admin Portal">
        <Settings className="w-5 h-5" />
      </Link>

      {/* ── LOADING ── */}
      {step === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl" style={{ background: `linear-gradient(135deg, ${gc}, ${g2})`, boxShadow: `0 10px 30px ${gc}40` }}>
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          </div>
          <p className="text-sm font-bold tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Loading campaign…</p>
        </div>
      )}

      {/* ── NOT FOUND ── */}
      {step === "not-found" && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
          <div className="w-full max-w-sm rounded-3xl p-8 text-center space-y-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}>
            <div className="text-5xl">📭</div>
            <div>
              <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Campaign Inactive</h1>
              <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>This promotional campaign is currently unavailable.</p>
            </div>
            <Link href="/admin" className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-black text-white transition-all hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${gc}, ${g2})`, boxShadow: `0 6px 20px ${gc}30` }}>
              Go to Admin Dashboard <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* ── BRAND HEADER (shown on register + wheel steps) ── */}
      {campaign && (step === "register" || step === "wheel" || step === "already-spun") && (
        <header className="relative z-10 w-full max-w-sm px-5 pt-10 pb-4 flex flex-col items-center gap-3 text-center">
          {campaign.logoUrl ? (
            <div className="p-2.5 rounded-2xl bg-white/[0.04] backdrop-blur-md border border-white/10" style={{ boxShadow: `0 8px 30px ${gc}25` }}>
              <img
                src={campaign.logoUrl}
                alt={campaign.name}
                className="h-16 w-auto object-contain max-w-[200px]"
                style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.5))" }}
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-2xl" style={{ background: `linear-gradient(135deg, ${gc}, ${g2})`, boxShadow: `0 10px 30px ${gc}40` }}>
              🎯
            </div>
          )}

          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>
              {campaign.name}
            </h1>
            {campaign.subTitle && (
              <div
                className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-[0.2em]"
                style={{
                  background: subTitleBg,
                  border: `1px solid ${subTitleBorder}`,
                  color: subTitleColor,
                }}
              >
                {campaign.subTitle}
              </div>
            )}
          </div>

          {step === "register" && (
            <p className="text-xs sm:text-sm leading-relaxed max-w-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              {campaign.welcomeMessage}
            </p>
          )}
        </header>
      )}

      {/* ── REGISTRATION FORM ── */}
      {step === "register" && campaign && (
        <main className="relative z-10 w-full max-w-sm px-5 pb-12 flex-1 flex flex-col justify-center">
          <div
            className="rounded-3xl p-6 sm:p-7 space-y-5 transition-all"
            style={{
              background: `linear-gradient(180deg, rgba(255,255,255,0.06), ${gc}0a), rgba(10, 18, 30, 0.75)`,
              backdropFilter: "blur(24px)",
              border: `1px solid ${gc}30`,
              boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 40px ${gc}15, inset 0 1px 0 rgba(255,255,255,0.12)`,
            }}
          >
            {/* Top brand glow bar */}
            <div className="h-1 w-16 rounded-full mx-auto" style={{ background: `linear-gradient(90deg, ${gc}, ${g2})`, boxShadow: `0 0 10px ${gc}` }} />

            <div>
              <h2 className="text-lg font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Enter Your Details</h2>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>Register to spin the wheel for instant prizes.</p>
            </div>
            <RegistrationForm
              onSubmit={handleRegister}
              submitting={submitting}
              error={regError}
              accentColor={campaign.primaryColor || gc}
              secondaryColor={campaign.secondaryColor || g2}
            />
          </div>
        </main>
      )}

      {/* ── ALREADY SPUN ── */}
      {step === "already-spun" && campaign && (
        <main className="relative z-10 w-full max-w-sm px-5 pb-12 flex-1 flex items-center">
          <div
            className="w-full rounded-3xl p-8 text-center space-y-5"
            style={{
              background: `linear-gradient(180deg, rgba(255,255,255,0.05), ${gc}08), rgba(10, 18, 30, 0.8)`,
              backdropFilter: "blur(20px)",
              border: `1px solid ${gc}25`,
              boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 30px ${gc}15`,
            }}
          >
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-3xl" style={{ background: `${gc}20`, border: `1px solid ${gc}40` }}>
              🔒
            </div>
            <div>
              <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Already Played</h1>
              <p className="text-xs sm:text-sm mt-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                This phone number has already participated in this promotional campaign.
              </p>
            </div>
            <button
              onClick={() => { setRegError(null); setStep("register"); }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black transition-all hover:opacity-90 cursor-pointer"
              style={{
                background: `linear-gradient(135deg, ${gc}, ${g2})`,
                color: spinBtnTextColor,
                boxShadow: `0 6px 20px ${gc}35`,
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Try a different number
            </button>
          </div>
        </main>
      )}

      {/* ── WHEEL STAGE ── */}
      {step === "wheel" && campaign && participant && (
        <main className="relative z-10 w-full max-w-sm px-4 pb-12 flex-1 flex flex-col items-center justify-center gap-6">
          <div className="text-center space-y-1">
            <p className="text-lg sm:text-xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
              Welcome, <span style={{ color: nameHighlightColor }}>{participant.name}</span>! 👋
            </p>
            <p className="text-xs sm:text-sm font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>
              {isSpinning ? "The wheel is spinning…" : "Tap the button below to spin for rewards!"}
            </p>
          </div>

          {/* Wheel with ambient background aura */}
          <div className="relative flex items-center justify-center">
            <div
              className="absolute inset-0 rounded-full blur-3xl opacity-30 pointer-events-none"
              style={{ background: `radial-gradient(circle, ${gc}, ${g2})` }}
            />
            <SpinWheel
              prizes={getEffectivePrizes(campaign, activeStoreCode)}
              targetIndex={targetIndex !== null ? (() => {
                const effective = getEffectivePrizes(campaign, activeStoreCode);
                const full = campaign.prizes[targetIndex];
                return effective.findIndex((p) => p.id === full?.id);
              })() : null}
              spinToken={spinToken}
              onFinish={handleFinish}
              accentColor={campaign.primaryColor || gc}
              logoUrl={campaign.logoUrl}
            />
          </div>

          <button
            onClick={handleSpinClick}
            disabled={isSpinning}
            className="w-full max-w-[290px] flex items-center justify-center gap-2.5 py-4 rounded-2xl font-black text-base transition-all hover:opacity-95 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${gc}, ${g2})`,
              color: spinBtnTextColor,
              boxShadow: `0 12px 32px ${gc}50, 0 4px 12px ${g2}40`,
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
          secondaryColor={campaign.secondaryColor || g2}
          backgroundColor={campaign.backgroundColor || bgColor}
          onClose={handleReset}
        />
      )}
    </div>
  );
}
