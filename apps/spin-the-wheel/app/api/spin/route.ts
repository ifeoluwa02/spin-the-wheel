import { NextRequest, NextResponse } from "next/server";
import { normalizeNigerianPhone } from "@/lib/phone";
import {
  getCampaign,
  getStoreInventory,
  getEffectivePrizes,
  recordParticipant,
  hasAlreadySpun,
  generateVoucherCode,
} from "@/lib/campaign";
import { pickPrizeIndex } from "@/lib/pickPrize";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency Locks & Anti-Abuse Tracking (In-Memory)
// ─────────────────────────────────────────────────────────────────────────────

// Prevents rapid-fire double clicks for the exact same phone number
const activePhoneLocks = new Set<string>();

// Tracks recent spin timestamps per phone to prevent script spam on a single phone
const phoneAttemptHistory = new Map<string, number[]>();

// High-ceiling volumetric DoS tracker per IP (120 req/min) — safe for shared mall Wi-Fi
const ipVolumetricHistory = new Map<string, number[]>();

// Cleanup stale memory every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [phone, timestamps] of phoneAttemptHistory.entries()) {
    const valid = timestamps.filter((t) => now - t < 60000);
    if (valid.length === 0) phoneAttemptHistory.delete(phone);
    else phoneAttemptHistory.set(phone, valid);
  }
  for (const [ip, timestamps] of ipVolumetricHistory.entries()) {
    const valid = timestamps.filter((t) => now - t < 60000);
    if (valid.length === 0) ipVolumetricHistory.delete(ip);
    else ipVolumetricHistory.set(ip, valid);
  }
}, 5 * 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    let body: any = null;
    try {
      body = await request.json();
    } catch {
      // Body will be caught by validation below
    }

    const isKiosk = Boolean(body?.isKiosk);
    const ipCeiling = isKiosk ? 120 : 60;

    // 1. Volumetric Rate Limiting per IP (Defense-in-depth: enforces ceiling before processing)
    const rawIp = request.headers.get("x-forwarded-for") || "";
    const clientIp = rawIp ? rawIp.split(",")[0].trim() : "unknown";

    const now = Date.now();
    const ipTimestamps = (ipVolumetricHistory.get(clientIp) || []).filter((t) => now - t < 60000);
    if (ipTimestamps.length >= ipCeiling) {
      return NextResponse.json(
        { error: "Too many requests from this network. Please wait a moment." },
        { status: 429 }
      );
    }
    ipTimestamps.push(now);
    ipVolumetricHistory.set(clientIp, ipTimestamps);

    const { campaignId, storeCode, participant } = body || {};

    if (!campaignId || !participant || !participant.phone) {
      return NextResponse.json(
        { error: "Missing required spin parameters." },
        { status: 400 }
      );
    }

    // 2. Validate Participant Name (Enforce 2-60 chars, letters only, no numbers, reject PHP/HTML/script code injection)
    const rawName = typeof participant.name === "string" ? participant.name.trim() : "";
    if (!rawName || rawName.length < 2 || rawName.length > 60) {
      return NextResponse.json(
        { error: "Please enter a valid full name between 2 and 60 characters." },
        { status: 400 }
      );
    }

    if (/\d/.test(rawName)) {
      return NextResponse.json(
        { error: "Name must not contain numbers." },
        { status: 400 }
      );
    }

    if (/[<>{}\[\]\\\/;`$#%^*+=~|]/.test(rawName) || /<\?php/i.test(rawName)) {
      return NextResponse.json(
        { error: "Name contains invalid special or executable characters." },
        { status: 400 }
      );
    }

    // Normalize sanitized name
    participant.name = rawName.replace(/\s+/g, " ");

    // 3. Validate & Normalize Phone Number
    const rawPhone = String(participant.phone || "");
    const normalizedPhone = normalizeNigerianPhone(rawPhone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Please enter a valid Nigerian mobile phone number (e.g. 08012345678)." },
        { status: 400 }
      );
    }


    // 3. Per-Phone Concurrency & Replay Lock
    if (activePhoneLocks.has(normalizedPhone)) {
      return NextResponse.json(
        { error: "A spin is already being processed for this phone number." },
        { status: 429 }
      );
    }

    const phoneTimestamps = (phoneAttemptHistory.get(normalizedPhone) || []).filter(
      (t) => now - t < 30000
    );

    if (phoneTimestamps.length >= 2) {
      return NextResponse.json(
        { error: "Please wait a few seconds before trying again." },
        { status: 429 }
      );
    }
    phoneTimestamps.push(now);
    phoneAttemptHistory.set(normalizedPhone, phoneTimestamps);

    // Acquire lock for this phone
    activePhoneLocks.add(normalizedPhone);

    try {
      // 4. Fetch Campaign & Check Active Status
      const campaign = await getCampaign(campaignId, true);
      if (!campaign || !campaign.active) {
        return NextResponse.json(
          { error: "Campaign is currently inactive or not found." },
          { status: 404 }
        );
      }

      // 5. One-Spin-Per-Phone Enforcement
      if (campaign.oneSpinPerPhone) {
        const alreadySpun = await hasAlreadySpun(campaignId, normalizedPhone);
        if (alreadySpun) {
          return NextResponse.json(
            { error: "This phone number has already participated in this campaign." },
            { status: 409 }
          );
        }
      }

      // 6. Fetch Store Inventory & Calculate Available Prizes
      const cleanStoreCode = storeCode ? String(storeCode).trim().toLowerCase() : "";

      // Block spins from stores that have been deactivated by the admin
      if (cleanStoreCode) {
        const storeRecord = campaign.stores?.find(
          (s) =>
            (s.code && s.code.toLowerCase() === cleanStoreCode) ||
            (s.id && s.id.toLowerCase() === cleanStoreCode)
        );
        if (storeRecord && storeRecord.active === false) {
          return NextResponse.json(
            { error: "This store is not currently active. Please check back later." },
            { status: 403 }
          );
        }
      }

      let storeInventory: Record<string, number> = {};
      if (cleanStoreCode) {
        const invRecord = await getStoreInventory(campaignId, cleanStoreCode);
        if (invRecord?.claimedCounts) {
          storeInventory = invRecord.claimedCounts;
        }
      }

      const effectivePrizes = getEffectivePrizes(campaign, cleanStoreCode, storeInventory);
      if (!effectivePrizes.length) {
        return NextResponse.json(
          { error: "No prizes currently available for this location." },
          { status: 400 }
        );
      }

      // 7. Secure Server-Side Prize Determination
      const targetIndex = pickPrizeIndex(effectivePrizes);
      if (targetIndex < 0 || targetIndex >= effectivePrizes.length) {
        return NextResponse.json(
          { error: "Could not calculate prize selection. Please try again." },
          { status: 500 }
        );
      }

      const wonPrize = effectivePrizes[targetIndex];
      const isWinner = !wonPrize.isLosing;
      const voucherCode = isWinner
        ? generateVoucherCode(wonPrize.voucherPrefix || "SPIN")
        : "";

      // 8. Resolve Authoritative Store Information
      let resolvedStore = campaign.stores?.find(
        (s) =>
          (cleanStoreCode && s.code && s.code.toLowerCase() === cleanStoreCode) ||
          (cleanStoreCode && s.id && s.id.toLowerCase() === cleanStoreCode)
      );

      // Fallback: If cleanStoreCode didn't match, attempt resolving by storeName
      if (!resolvedStore && participant.storeName && participant.storeName !== "Kiosk") {
        const cleanName = participant.storeName.trim().toLowerCase();
        resolvedStore = campaign.stores?.find(
          (s) => s.name && s.name.trim().toLowerCase() === cleanName
        );
      }

      // Authoritative store code & name: prefer campaign store record
      const finalStoreCode = resolvedStore?.code || cleanStoreCode || "";
      const finalStoreName =
        resolvedStore?.name ||
        (participant.storeName && participant.storeName !== "Kiosk" ? participant.storeName : "") ||
        (finalStoreCode ? finalStoreCode : "General Stage");

      // 9. Atomic Recording & Inventory Decrement Server-Side
      const safeName = String(participant.name || "Anonymous").trim().slice(0, 100);
      const safeEmail = String(participant.email || "").trim().slice(0, 120);
      const safeAge = String(participant.ageRange || "").trim().slice(0, 30);
      const safeGender = String(participant.gender || "").trim().slice(0, 30);

      const participantId = await recordParticipant({
        name: safeName || "Anonymous",
        phone: normalizedPhone,
        email: safeEmail,
        ageRange: safeAge,
        gender: safeGender,
        campaignId: campaign.id,
        prizeId: wonPrize.id,
        prizeLabel: wonPrize.label,
        voucherCode: voucherCode,
        won: isWinner,
        createdAt: Date.now(),
        storeCode: finalStoreCode,
        storeName: finalStoreName,
      });


      // Return server-verified result to the frontend
      return NextResponse.json({
        success: true,
        participantId,
        targetIndex,
        prize: wonPrize,
        prizes: effectivePrizes,
        voucherCode,
      });
    } finally {
      // Always release lock
      activePhoneLocks.delete(normalizedPhone);
    }
  } catch (err: any) {
    console.error("API /api/spin error:", err);
    return NextResponse.json(
      { error: "Server encountered an error processing your spin. Please try again." },
      { status: 500 }
    );
  }
}
