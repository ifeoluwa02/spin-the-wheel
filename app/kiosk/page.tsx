"use client";

import { useEffect, useState } from "react";
import type { Campaign, Prize } from "@/types";
import {
  getCampaign,
  hasAlreadySpun,
  recordParticipant,
  generateVoucherCode,
  getEffectivePrizes,
  subscribeStoreInventory,
  subscribeCampaign,
  sanitizeCampaignForPublic,
} from "@/lib/campaign";
import { pickPrizeIndex } from "@/lib/pickPrize";
import {
  getGradientContrastColor,
  isLightColor,
  getAmbientGlowOpacity,
} from "@/lib/colors";
import { Loader2, MapPin, ChevronRight, RotateCcw, Search, X } from "lucide-react";
import RegistrationForm, { RegistrationValues } from "@/components/RegistrationForm";
import SpinWheel from "@/components/SpinWheel";
import WinnerModal from "@/components/WinnerModal";

type KioskStep = "loading" | "not-found" | "pick-store" | "register" | "wheel";

export default function KioskPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [step, setStep] = useState<KioskStep>("loading");

  // Store chosen for this session — persists across spins
  const [storeCode, setStoreCode] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeSearch, setStoreSearch] = useState("");
  const [storeInventory, setStoreInventory] = useState<Record<string, number>>({});

  // Per-spin participant state
  const [participant, setParticipant] = useState<RegistrationValues | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Wheel state
  const [isSpinning, setIsSpinning] = useState(false);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [spinningPrizes, setSpinningPrizes] = useState<Prize[] | null>(null);
  const [spinToken, setSpinToken] = useState(0);
  const [wonPrize, setWonPrize] = useState<Prize | null>(null);
  const [voucherCode, setVoucherCode] = useState("");

  // ── Boot: subscribe to live campaign ─────────────────────────────
  useEffect(() => {
    let campaignId = process.env.NEXT_PUBLIC_CAMPAIGN_ID || "";
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qId = params.get("c");
      if (qId) campaignId = qId;
    }
    if (!campaignId) {
      setStep("not-found");
      return;
    }

    const unsub = subscribeCampaign(campaignId, (c) => {
      if (!c || !c.active || !c.prizes?.length) {
        setStep("not-found");
        return;
      }
      setCampaign(sanitizeCampaignForPublic(c));
      setStep((curr) => (curr === "loading" || curr === "not-found" ? (c.stores?.length ? "pick-store" : "register") : curr));
    });

    return () => unsub();
  }, []);

  // Listen to store inventory in real-time when store is selected
  useEffect(() => {
    if (!campaign?.id || !storeCode) {
      setStoreInventory({});
      return;
    }
    const unsub = subscribeStoreInventory(campaign.id, storeCode, (inv) => {
      setStoreInventory(inv?.claimedCounts || {});
    });
    return () => unsub();
  }, [campaign?.id, storeCode]);

  function handlePickStore(code: string, name: string) {
    setStoreCode(code);
    setStoreName(name);
    setStep("register");
  }

  async function handleRegister(values: RegistrationValues) {
    if (!campaign) return;
    setSubmitting(true);
    setRegError(null);
    try {
      if (campaign.oneSpinPerPhone) {
        const already = await hasAlreadySpun(campaign.id, values.phone);
        if (already) {
          setRegError("This phone number has already participated in this campaign.");
          setSubmitting(false);
          return;
        }
      }
      setParticipant(values);
      setStep("wheel");
    } catch {
      setRegError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const [spinError, setSpinError] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<{ prize: Prize; voucherCode: string } | null>(null);

  async function handleSpinClick() {
    if (!campaign || isSpinning || !participant) return;
    const effective = getEffectivePrizes(campaign, storeCode, storeInventory);
    if (!effective.length) {
      setSpinError("No prizes currently available for this store.");
      return;
    }

    setIsSpinning(true);
    setSpinError(null);

    try {
      const res = await fetch("/api/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          storeCode: storeCode || "",
          isKiosk: true,
          participant: {
            name: participant.name,
            phone: participant.phone,
            email: participant.email || "",
            ageRange: participant.ageRange || "",
            gender: participant.gender || "",
            storeName: storeName || "Kiosk",
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setIsSpinning(false);
        setSpinError(data.error || "Failed to process spin. Please try again.");
        return;
      }

      const resolvedPrizes = (data.prizes && data.prizes.length > 0) ? data.prizes : effective;
      const resolvedTarget = (typeof data.targetIndex === "number" && data.targetIndex >= 0 && data.targetIndex < resolvedPrizes.length)
        ? data.targetIndex
        : resolvedPrizes.findIndex((p: Prize) => p.id === data.prize?.id);

      setSpinningPrizes(resolvedPrizes);
      setTargetIndex(resolvedTarget >= 0 ? resolvedTarget : 0);
      setPendingResult({ prize: data.prize, voucherCode: data.voucherCode });
      setSpinToken(Date.now());
    } catch {
      setIsSpinning(false);
      setSpinError("Connection error. Please check network connection.");
    }
  }

  function handleFinish(prize: Prize) {
    setIsSpinning(false);
    setSpinningPrizes(null);
    setTargetIndex(null);

    const finalPrize = pendingResult?.prize || prize;
    const finalCode = pendingResult?.voucherCode || "";

    setVoucherCode(finalCode);
    setWonPrize(finalPrize);
    setPendingResult(null);
  }

  // Resets to registration but keeps store selected
  function handleNextParticipant() {
    setWonPrize(null);
    setParticipant(null);
    setTargetIndex(null);
    setSpinningPrizes(null);
    setRegError(null);
    setSpinError(null);
    setPendingResult(null);
    setStep("register");
  }

  const gc = campaign?.gradientStart || campaign?.primaryColor || "#FF6B35";
  const g2 = campaign?.gradientEnd || campaign?.secondaryColor || "#00BFA6";
  const bgColor = campaign?.backgroundColor || "#070d14";
  const spinBtnTextColor = getGradientContrastColor(gc, g2);
  const nameHighlightColor = isLightColor(g2) ? "#ffffff" : g2;
  const orb1Opacity = getAmbientGlowOpacity(gc, 0.25);
  const orb2Opacity = getAmbientGlowOpacity(g2, 0.2);

  return (
    <div
      className="relative min-h-screen w-full flex flex-col items-center overflow-x-hidden"
      style={{
        background: `radial-gradient(circle at 15% 10%, ${gc}35 0%, transparent 45%), radial-gradient(circle at 85% 20%, ${g2}30 0%, transparent 45%), radial-gradient(circle at 50% 65%, ${gc}20 0%, transparent 50%), ${bgColor}`,
        fontFamily: "Nunito, sans-serif",
      }}
    >
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[120px] animate-pulse" style={{ background: gc, opacity: orb1Opacity, animationDuration: "8s" }} />
        <div className="absolute top-1/3 -right-32 w-96 h-96 rounded-full blur-[120px] animate-pulse" style={{ background: g2, opacity: orb2Opacity, animationDuration: "10s" }} />
      </div>
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      {/* LOADING */}
      {step === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${gc}, ${g2})` }}>
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          </div>
          <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</p>
        </div>
      )}

      {/* NOT FOUND */}
      {step === "not-found" && (
        <div className="flex-1 flex items-center justify-center p-6 relative z-10">
          <div className="rounded-3xl p-8 text-center space-y-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}>
            <div className="text-5xl">📭</div>
            <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>Campaign Unavailable</h1>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>This promotional campaign is currently inactive.</p>
          </div>
        </div>
      )}

      {/* PICK STORE */}
      {step === "pick-store" && campaign && (() => {
        const query = storeSearch.trim().toLowerCase();
        const visibleStores = query
          ? campaign.stores!.filter(s =>
              s.name.toLowerCase().includes(query) ||
              (s.state && s.state.toLowerCase().includes(query)) ||
              (s.city && s.city.toLowerCase().includes(query)) ||
              (s.code && s.code.toLowerCase().includes(query))
            )
          : campaign.stores!;
        return (
          <div className="relative z-10 w-full max-w-md px-5 py-12 flex flex-col items-center gap-6">
            {/* Brand header */}
            <div className="text-center space-y-3">
              {campaign.logoUrl ? (
                <img src={campaign.logoUrl} alt={campaign.name} className="h-14 w-auto mx-auto object-contain" style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.5))" }} />
              ) : (
                <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-3xl" style={{ background: `linear-gradient(135deg, ${gc}, ${g2})` }}>🎯</div>
              )}
              <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>{campaign.name}</h1>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>Select your store to begin</p>
            </div>

            {/* Search input */}
            <div className="w-full relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <Search className="w-4 h-4" style={{ color: storeSearch ? gc : "rgba(255,255,255,0.3)" }} />
              </div>
              <input
                type="text"
                placeholder="Search store name, city or state…"
                value={storeSearch}
                onChange={e => setStoreSearch(e.target.value)}
                autoComplete="off"
                className="w-full pl-10 pr-10 py-3.5 rounded-2xl text-sm text-white outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: storeSearch ? `1px solid ${gc}60` : "1px solid rgba(255,255,255,0.1)",
                  backdropFilter: "blur(16px)",
                  boxShadow: storeSearch ? `0 0 0 3px ${gc}15` : "none",
                }}
              />
              {storeSearch && (
                <button
                  onClick={() => setStoreSearch("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full transition-all hover:opacity-70"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Store list */}
            <div className="w-full space-y-2 max-h-[60vh] overflow-y-auto pr-0.5">
              {visibleStores.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <div className="text-4xl">🔍</div>
                  <p className="text-sm font-bold text-white">No stores found</p>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>Try a different search term</p>
                  <button onClick={() => setStoreSearch("")} className="mt-2 text-xs font-bold transition-all hover:opacity-70" style={{ color: gc }}>Clear search</button>
                </div>
              ) : visibleStores.map((s) => {
                // Highlight matched text
                function highlight(text: string) {
                  if (!query || !text.toLowerCase().includes(query)) return <span>{text}</span>;
                  const idx = text.toLowerCase().indexOf(query);
                  return (
                    <span>
                      {text.slice(0, idx)}
                      <mark style={{ background: `${gc}40`, color: gc, borderRadius: "2px", padding: "0 1px" }}>{text.slice(idx, idx + query.length)}</mark>
                      {text.slice(idx + query.length)}
                    </span>
                  );
                }
                return (
                  <button
                    key={s.id || s.code}
                    onClick={() => { handlePickStore(s.code, s.name); setStoreSearch(""); }}
                    className="w-full flex items-center justify-between px-5 py-4 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${gc}30`, backdropFilter: "blur(16px)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${gc}20`, border: `1px solid ${gc}40` }}>
                        <MapPin className="w-4 h-4" style={{ color: gc }} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">{highlight(s.name)}</p>
                        {(s.state || s.city) && (
                          <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                            {s.state ? highlight(s.state) : null}{s.city ? <span>, {highlight(s.city)}</span> : null}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
                  </button>
                );
              })}
            </div>

            {/* Result count hint */}
            {query && visibleStores.length > 0 && (
              <p className="text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.25)" }}>
                {visibleStores.length} store{visibleStores.length !== 1 ? "s" : ""} match
              </p>
            )}
          </div>
        );
      })()}

      {/* REGISTER */}
      {step === "register" && campaign && (
        <>
          <header className="relative z-10 w-full max-w-sm px-5 pt-10 pb-4 flex flex-col items-center gap-3 text-center">
            {campaign.logoUrl ? (
              <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10">
                <img src={campaign.logoUrl} alt={campaign.name} className="h-14 w-auto object-contain max-w-[180px]" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `linear-gradient(135deg, ${gc}, ${g2})` }}>🎯</div>
            )}
            <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>{campaign.name}</h1>
            {storeName && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold" style={{ background: `${gc}18`, border: `1px solid ${gc}35`, color: gc }}>
                <MapPin className="w-3 h-3" /> {storeName}
              </div>
            )}
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{campaign.welcomeMessage}</p>
          </header>
          <main className="relative z-10 w-full max-w-sm px-5 pb-12 flex-1 flex flex-col justify-center">
            <div
              className="rounded-3xl p-6 space-y-5"
              style={{ background: `linear-gradient(180deg, rgba(255,255,255,0.06), ${gc}0a), rgba(10,18,30,0.75)`, backdropFilter: "blur(24px)", border: `1px solid ${gc}30`, boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 40px ${gc}15, inset 0 1px 0 rgba(255,255,255,0.12)` }}
            >
              <div className="h-1 w-16 rounded-full mx-auto" style={{ background: `linear-gradient(90deg, ${gc}, ${g2})` }} />
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
            {campaign.stores && campaign.stores.length > 0 && (
              <button onClick={() => setStep("pick-store")} className="mt-4 w-full text-center text-xs font-bold transition-all hover:opacity-80" style={{ color: "rgba(255,255,255,0.3)" }}>
                ← Change store
              </button>
            )}
          </main>
        </>
      )}

      {/* WHEEL */}
      {step === "wheel" && campaign && participant && (
        <>
          <header className="relative z-10 w-full max-w-sm px-5 pt-10 pb-2 text-center space-y-2">
            <p className="text-lg font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
              Welcome, <span style={{ color: nameHighlightColor }}>{participant.name}</span>! 👋
            </p>
            {storeName && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold" style={{ background: `${gc}18`, border: `1px solid ${gc}35`, color: gc }}>
                <MapPin className="w-3 h-3" /> {storeName}
              </div>
            )}
            <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>
              {isSpinning ? "The wheel is spinning…" : "Tap the button below to spin for rewards!"}
            </p>
          </header>
          <main className="relative z-10 w-full max-w-sm px-4 pb-12 flex-1 flex flex-col items-center justify-center gap-6">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-full blur-3xl opacity-30 pointer-events-none" style={{ background: `radial-gradient(circle, ${gc}, ${g2})` }} />
              <SpinWheel
                prizes={spinningPrizes || getEffectivePrizes(campaign, storeCode, storeInventory)}
                targetIndex={targetIndex}
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
              style={{ background: `linear-gradient(135deg, ${gc}, ${g2})`, color: spinBtnTextColor, boxShadow: `0 12px 32px ${gc}50, 0 4px 12px ${g2}40`, fontFamily: "Rubik, sans-serif" }}
            >
              {isSpinning ? <><Loader2 className="w-5 h-5 animate-spin" /> Spinning…</> : <>🎡 Spin the Wheel!</>}
            </button>
            {spinError && (
              <p className="text-red-400 text-xs font-semibold text-center max-w-[290px] px-2 py-1 rounded-lg bg-red-950/40 border border-red-500/20">
                {spinError}
              </p>
            )}
            <button onClick={() => { setParticipant(null); setStep("register"); }} className="text-xs font-bold transition-all hover:opacity-80" style={{ color: "rgba(255,255,255,0.25)" }}>
              <RotateCcw className="w-3 h-3 inline mr-1" />Back to registration
            </button>
          </main>
        </>
      )}

      {/* WINNER MODAL — resets to registration, not store picker */}
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
          onClose={handleNextParticipant}
        />
      )}
    </div>
  );
}
