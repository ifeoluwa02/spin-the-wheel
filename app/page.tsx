"use client";

import { useEffect, useState } from "react";
import type { Campaign, Prize } from "@/types";
import { getCampaign, hasAlreadySpun, recordParticipant } from "@/lib/campaign";
import { pickPrizeIndex } from "@/lib/pickPrize";
import RegistrationForm, { RegistrationValues } from "@/components/RegistrationForm";
import SpinWheel from "@/components/SpinWheel";
import WinnerModal from "@/components/WinnerModal";

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

  const campaignId = process.env.NEXT_PUBLIC_CAMPAIGN_ID || "demo-campaign";

  useEffect(() => {
    let cancelled = false;
    getCampaign(campaignId).then((c) => {
      if (cancelled) return;
      if (!c || !c.active || !c.prizes?.length) {
        setStep("not-found");
        return;
      }
      setCampaign(c);
      setStep("register");
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  async function handleRegister(values: RegistrationValues) {
    if (!campaign) return;
    setSubmitting(true);
    setRegError(null);
    try {
      if (campaign.oneSpinPerPhone) {
        const already = await hasAlreadySpun(campaign.id, values.phone);
        if (already) {
          setStep("already-spun");
          setSubmitting(false);
          return;
        }
      }
      setParticipant(values);
      setStep("wheel");
    } catch (err) {
      console.error(err);
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
    setWonPrize(prize);
    if (campaign && participant) {
      try {
        await recordParticipant({
          name: participant.name,
          phone: participant.phone,
          email: participant.email,
          campaignId: campaign.id,
          prizeId: prize.id,
          prizeLabel: prize.label,
          won: !prize.isLosing,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.error("Failed to record participant", err);
      }
    }
  }

  const glowStyle = campaign
    ? ({ ["--glow-color" as any]: campaign.primaryColor } as React.CSSProperties)
    : undefined;

  return (
    <div className="stage" style={glowStyle}>
      {step === "loading" && <p className="hello-name">Loading campaign…</p>}

      {step === "not-found" && (
        <p className="hello-name">This campaign isn&apos;t available right now.</p>
      )}

      {campaign && (
        <div className="brand-row">
          {campaign.logoUrl && <img src={campaign.logoUrl} alt={campaign.name} className="brand-logo" />}
          <span className="brand-name">{campaign.name}</span>
          {step === "register" && <span className="brand-tagline">{campaign.welcomeMessage}</span>}
        </div>
      )}

      {step === "register" && campaign && (
        <div className="card">
          <h1 className="card-title">Enter your details</h1>
          <p className="card-sub">We just need a couple of things before you spin.</p>
          <RegistrationForm
            onSubmit={handleRegister}
            submitting={submitting}
            error={regError}
            accentColor={campaign.primaryColor}
          />
        </div>
      )}

      {step === "already-spun" && campaign && (
        <div className="card" style={{ textAlign: "center" }}>
          <h1 className="card-title">Already entered</h1>
          <p className="card-sub">This phone number has already been used for a spin in this campaign.</p>
          <button
            className="btn-secondary"
            onClick={() => {
              setRegError(null);
              setStep("register");
            }}
          >
            Try a different number
          </button>
        </div>
      )}

      {step === "wheel" && campaign && participant && (
        <div className="wheel-stage">
          <p className="hello-name">{participant.name}, tap the wheel or press spin!</p>
          <SpinWheel
            prizes={campaign.prizes}
            targetIndex={targetIndex}
            spinToken={spinToken}
            onFinish={handleFinish}
            accentColor={campaign.primaryColor}
          />
          <button
            className="btn-primary"
            style={{ background: campaign.primaryColor, width: "100%", maxWidth: 260 }}
            onClick={handleSpinClick}
            disabled={isSpinning}
          >
            {isSpinning ? "Spinning…" : "Spin the wheel"}
          </button>
        </div>
      )}

      {wonPrize && campaign && (
        <WinnerModal
          prize={wonPrize}
          campaignName={campaign.name}
          accentColor={campaign.primaryColor}
          onClose={() => setWonPrize(null)}
        />
      )}
    </div>
  );
}
