import { NextRequest, NextResponse } from "next/server";
import {
  getCampaign,
  recordCheckIn,
  recordCheckOut,
  getDailyCheckIns,
  getStoreTodayCheckIn,
  updateShiftSampleCounter,
  getTodayDateStr,
} from "@/lib/repository";
import { verifyPassword } from "@/lib/auth";
import { evaluateGeofence } from "@/lib/geo";
import type { CheckInRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/checkin?campaignId=...&date=...&storeCode=...
 * Returns today's checkins for supervisor table or checks a store's status.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");
    const dateStr = searchParams.get("date") || getTodayDateStr();
    const storeCode = searchParams.get("storeCode");

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required." }, { status: 400 });
    }

    if (storeCode) {
      const activeRecord = await getStoreTodayCheckIn(campaignId, storeCode, dateStr);
      return NextResponse.json({ success: true, checkIn: activeRecord });
    }

    const records = await getDailyCheckIns(campaignId, dateStr);
    return NextResponse.json({ success: true, records, date: dateStr });
  } catch (err: any) {
    console.error("GET /api/checkin error:", err);
    return NextResponse.json({ error: err.message || "Failed to retrieve check-in records." }, { status: 500 });
  }
}

/**
 * POST /api/checkin
 * Handles check_in, check_out, and sample_counter updates.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // ── 1. CHECK-IN ACTION ──
    if (action === "check_in" || !action) {
      const { campaignId, storeCode, baName, baPhone, pin, latitude, longitude, accuracy, photoUrl, isSimulated } = body;

      if (!campaignId || !storeCode || !baName?.trim()) {
        return NextResponse.json(
          { error: "Campaign ID, store code, and BA name are required." },
          { status: 400 }
        );
      }

      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return NextResponse.json(
          { error: "Valid GPS latitude and longitude are required." },
          { status: 400 }
        );
      }

      const campaign = await getCampaign(campaignId);
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      }

      const cleanCode = String(storeCode).trim().toLowerCase();
      const normCode = cleanCode.replace(/[^a-z0-9]/g, "");

      const store = (campaign.stores || []).find((s) => {
        const sCode = (s.storeCode || (s as any).code || "").trim().toLowerCase();
        const sId = (s.id || "").trim().toLowerCase();
        const sName = (s.name || "").trim().toLowerCase();

        if (sCode === cleanCode || sId === cleanCode) return true;
        if (normCode && sCode.replace(/[^a-z0-9]/g, "") === normCode) return true;
        if (normCode && sId.replace(/[^a-z0-9]/g, "") === normCode) return true;
        if (sName === cleanCode) return true;
        return false;
      });

      if (!store) {
        return NextResponse.json({ error: "Store not found in campaign." }, { status: 404 });
      }

      if (store.isActive === false || (store as any).active === false) {
        return NextResponse.json({ error: "This store location is currently deactivated." }, { status: 403 });
      }

      // Verify PIN if set on store or campaign
      const effectivePin = (store.pin && store.pin.trim()) || ((campaign as any).adminPin && (campaign as any).adminPin.trim()) || "";
      if (effectivePin) {
        const inputPin = String(pin || "").trim();
        if (!verifyPassword(inputPin, effectivePin)) {
          return NextResponse.json({ error: "Incorrect BA access PIN." }, { status: 401 });
        }
      }

      // Check if store already has an active check-in today
      const todayStr = getTodayDateStr();
      const existing = await getStoreTodayCheckIn(campaignId, store.code || storeCode, todayStr);
      if (existing && existing.status !== "checked_out") {
        return NextResponse.json({
          success: true,
          alreadyCheckedIn: true,
          checkIn: existing,
          message: "A shift is already active for this store today.",
        });
      }

      // Geofence calculation
      // If store has no GPS coordinates configured, we accept coordinates as base ground truth
      const targetLat = typeof store.lat === "number" ? store.lat : latitude;
      const targetLng = typeof store.lng === "number" ? store.lng : longitude;
      const radius = typeof store.geofenceRadius === "number" ? store.geofenceRadius : 100;

      const evalResult = evaluateGeofence(
        { latitude, longitude, accuracy },
        { latitude: targetLat, longitude: targetLng },
        radius
      );

      const status = evalResult.status === "verified" || evalResult.status === "drift" ? "verified" : "flagged";

      const record: Omit<CheckInRecord, "id" | "createdAt" | "updatedAt"> = {
        campaignId,
        storeCode: store.code || storeCode,
        storeName: store.name,
        baName: baName.trim(),
        baPhone: (baPhone || "").trim(),
        shiftDate: todayStr,
        checkInTime: new Date().toISOString(),
        checkInLat: latitude,
        checkInLng: longitude,
        checkInAccuracy: accuracy,
        targetLat,
        targetLng,
        distanceMeters: evalResult.distance,
        status,
        photoUrl: photoUrl || undefined,
        samplesLogged: 0,
      };

      const created = await recordCheckIn(record);

      return NextResponse.json({
        success: true,
        checkIn: created,
        evaluation: evalResult,
        isSimulated: Boolean(isSimulated),
      });
    }

    // ── 2. CHECK-OUT ACTION ──
    if (action === "check_out") {
      const { checkInId, latitude, longitude, notes } = body;
      if (!checkInId) {
        return NextResponse.json({ error: "checkInId is required." }, { status: 400 });
      }

      const updated = await recordCheckOut({ checkInId, latitude, longitude, notes });
      return NextResponse.json({ success: true, checkIn: updated });
    }

    // ── 3. SAMPLE COUNTER INCREMENT ──
    if (action === "sample_counter") {
      const { checkInId, delta } = body;
      if (!checkInId) {
        return NextResponse.json({ error: "checkInId is required." }, { status: 400 });
      }

      const newTotal = await updateShiftSampleCounter(checkInId, Number(delta) || 1);
      return NextResponse.json({ success: true, samplesLogged: newTotal });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error("POST /api/checkin error:", err);
    return NextResponse.json({ error: err.message || "Failed to process check-in request." }, { status: 500 });
  }
}
