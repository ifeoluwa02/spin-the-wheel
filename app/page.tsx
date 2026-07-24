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
import { Settings } from "lucide-react";

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
    const code = prize.isLosing
      ? ""
      : generateVoucherCode(prize.voucherPrefix || "SPIN");
    setVoucherCode(code);
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
          voucherCode: code,
          won: !prize.isLosing,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.error("Failed to record participant", err);
      }
    }
  }

  function handleReset() {
    setWonPrize(null);
    setParticipant(null);
    setTargetIndex(null);
    setStep("register");
  }

  const customStyle = campaign
    ? ({
        "--gradient-top": campaign.gradientStart || campaign.primaryColor || "#ea580c",
        "--gradient-bottom": campaign.gradientEnd || campaign.secondaryColor || "#1e40af",
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="stage" style={customStyle}>
      {/* Discreet Admin Link */}
      <Link
        href="/admin"
        className="fixed top-4 right-4 text-white/40 hover:text-white transition-colors z-50 p-2"
        title="Admin Portal"
      >
        <Settings className="w-5 h-5" />
      </Link>

      {step === "loading" && <p className="hello-name">Loading campaign…</p>}

      {step === "not-found" && (
        <div className="card" style={{ textAlign: "center" }}>
          <h1 className="card-title">Campaign Inactive</h1>
          <p className="card-sub">This promotional campaign is currently unavailable.</p>
          <Link href="/admin" className="btn-secondary">
            Go to Admin Dashboard
          </Link>
        </div>
      )}

      {campaign && step !== "loading" && (
        <div className="brand-row">
          {campaign.logoUrl && (
            <img src={campaign.logoUrl} alt={campaign.name} className="brand-logo" />
          )}
          <span className="brand-name">{campaign.name}</span>
          {step === "register" && (
            <p className="brand-tagline">{campaign.welcomeMessage}</p>
          )}
        </div>
      )}

      {step === "register" && campaign && (
        <div className="card">
          <h1 className="card-title">Enter Your Details</h1>
          <p className="card-sub">Register before spinning the wheel for instant prizes.</p>
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
          <h1 className="card-title">Already Played</h1>
          <p className="card-sub">
            This phone number has already been used for a spin in this campaign.
          </p>
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
          <p className="hello-name">Welcome {participant.name}! Tap Spin to win!</p>
          <SpinWheel
            prizes={campaign.prizes}
            targetIndex={targetIndex}
            spinToken={spinToken}
            onFinish={handleFinish}
            accentColor={campaign.primaryColor}
            logoUrl={campaign.logoUrl}
          />
          <button
            className="btn-primary"
            style={{
              background: campaign.primaryColor || "#0E7C7B",
              width: "100%",
              maxWidth: 280,
            }}
            onClick={handleSpinClick}
            disabled={isSpinning}
          >
            {isSpinning ? "Spinning…" : "Spin the Wheel!"}
          </button>
        </div>
      )}

      {wonPrize && campaign && participant && (
        <WinnerModal
          prize={wonPrize}
          participantName={participant.name}
          voucherCode={voucherCode}
          campaignName={campaign.name}
          subTitle={campaign.subTitle}
          accentColor={campaign.primaryColor}
          onClose={handleReset}
        />
      )}
    </div>
  );
}
