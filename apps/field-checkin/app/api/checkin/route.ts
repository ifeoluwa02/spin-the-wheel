import { NextRequest, NextResponse } from "next/server";
import {
  getCampaign,
  recordCheckIn,
  recordCheckOut,
  recordShiftHeartbeat,
  reviewCheckInRecord,
  getCheckInById,
  getDailyCheckIns,
  getStoreTodayCheckIn,
  updateShiftSampleCounter,
  recordSurvey,
  getDailySurveys,
  getTodayDateStr,
} from "@/lib/repository";
import {
  verifyPassword,
  createSessionToken,
  getRequestSession,
  setSessionCookie,
  BA_SHIFT_COOKIE_NAME,
  checkRateLimit,
  resetRateLimit,
  getClientIp,
  computeSha256Hex,
  isValidSelfieDataUrl,
  sanitizeInputText,
  sanitizeKeyValueMap,
} from "@/lib/auth";
import {
  evaluateGeofence,
  evaluateGpsTelemetry,
  isValidCoordinates,
  calculateDistanceMeters,
} from "@/lib/geo";
import {
  findDuplicateUniqueSurveyAnswer,
  generateRespondentId,
} from "@/lib/survey-templates";
import type { CheckInRecord, CheckInStatus, SurveyType, TasteFeedback } from "@/lib/types";

export const dynamic = "force-dynamic";

function isAuthorizedForShift(
  request: NextRequest,
  checkInId: string,
  campaignId?: string
): boolean {
  const session = getRequestSession(request, true);
  if (!session) return false;
  if (session.role === "superadmin") return true;
  if (session.role === "supervisor") {
    return !campaignId || session.campaignId?.toLowerCase() === campaignId.toLowerCase();
  }
  if (session.role === "ba") {
    if (session.checkInId && session.checkInId === checkInId) return true;
    if (session.storeCode) {
      const cPrefix = `${(session.campaignId || campaignId || "").toLowerCase()}__${session.storeCode.toLowerCase()}__`;
      if (checkInId.toLowerCase().startsWith(cPrefix)) return true;
    }
  }
  return false;
}

/**
 * GET /api/checkin?campaignId=...&date=...&storeCode=...&checkInId=...
 * - Supervisor table queries require an authenticated Supervisor or Superadmin session.
 * - Single shift lookup by `checkInId` validates the BA's active shift and returns shift + surveys.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId")?.trim().toLowerCase();
    const dateStr = searchParams.get("startDate") || searchParams.get("date") || getTodayDateStr();
    const endDateStr = searchParams.get("endDate") || dateStr;
    const storeCode = searchParams.get("storeCode");
    const checkInId = searchParams.get("checkInId");

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required." }, { status: 400 });
    }

    if (checkInId) {
      if (!isAuthorizedForShift(request, checkInId, campaignId)) {
        return NextResponse.json(
          { error: "Unauthorized shift session." },
          { status: 401 }
        );
      }
      const [shift, surveys] = await Promise.all([
        getCheckInById(checkInId),
        getDailySurveys(campaignId, dateStr, checkInId),
      ]);
      return NextResponse.json({
        success: true,
        checkIn: shift,
        surveys,
        date: dateStr,
      });
    }

    if (storeCode) {
      const activeRecord = await getStoreTodayCheckIn(campaignId, storeCode, dateStr);
      const session = getRequestSession(request, true);
      const isSupervisor =
        session &&
        (session.role === "superadmin" ||
          (session.role === "supervisor" && session.campaignId?.toLowerCase() === campaignId));

      return NextResponse.json({
        success: true,
        hasActiveShift: Boolean(activeRecord && activeRecord.status !== "checked_out"),
        checkIn: isSupervisor ? activeRecord : null,
      });
    }

    // Full daily check-ins + surveys require Supervisor or Superadmin authentication
    const session = getRequestSession(request, false);
    const isAuthorized =
      session &&
      (session.role === "superadmin" ||
        (session.role === "supervisor" && session.campaignId?.toLowerCase() === campaignId));

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Supervisor authentication required to view attendance records." },
        { status: 401 }
      );
    }

    const [records, surveys] = await Promise.all([
      getDailyCheckIns(campaignId, dateStr, endDateStr),
      getDailySurveys(campaignId, dateStr, undefined, endDateStr),
    ]);
    return NextResponse.json({
      success: true,
      records,
      surveys,
      date: dateStr,
      startDate: dateStr,
      endDate: endDateStr,
    });
  } catch (err: any) {
    console.error("GET /api/checkin error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve check-in records." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/checkin
 * Handles check_in, heartbeat, check_out, sample_counter, submit_survey, and review_checkin.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // ── 1. CHECK-IN ACTION ──
    if (action === "check_in" || !action) {
      const {
        campaignId,
        storeCode,
        baName,
        baPhone,
        pin,
        latitude,
        longitude,
        accuracy,
        timestamp,
        gpsSamples,
        photoUrl,
        deviceId,
        isSimulated,
      } = body;

      const cleanCampaignId = String(campaignId || "").trim().toLowerCase();
      if (!cleanCampaignId || !storeCode || !baName?.trim()) {
        return NextResponse.json(
          { error: "Campaign ID, store code, and BA name are required." },
          { status: 400 }
        );
      }

      const demoAllowed = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
      if (isSimulated && !demoAllowed) {
        return NextResponse.json(
          { error: "Simulated GPS check-in is disabled outside demo mode." },
          { status: 403 }
        );
      }

      // Validate live selfie photo evidence format & size (strictly base64 JPEG/PNG/WebP — blocks SVG XSS & PHP injection)
      if (!isValidSelfieDataUrl(photoUrl, 900_000)) {
        return NextResponse.json(
          { error: "A valid live camera selfie (JPEG/PNG/WebP under 900 KB) is required for check-in." },
          { status: 400 }
        );
      }

      const ip = getClientIp(request);
      const cleanCode = String(storeCode).trim().toLowerCase();
      const rateKey = `checkin:${ip}:${cleanCampaignId}:${cleanCode}`;
      const rateCheck = checkRateLimit(rateKey, 10, 15 * 60 * 1000);
      if (!rateCheck.allowed) {
        return NextResponse.json(
          {
            error: `Too many failed check-in attempts for this store. Retry in ${rateCheck.retryAfterSec}s.`,
          },
          { status: 429 }
        );
      }

      const campaign = await getCampaign(cleanCampaignId);
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      }

      const geofenceRequired = campaign.geofenceEnabled !== false;
      if (geofenceRequired && !isValidCoordinates(latitude, longitude)) {
        return NextResponse.json(
          { error: "Valid GPS latitude and longitude are required." },
          { status: 400 }
        );
      }

      const normCode = cleanCode.replace(/[^a-z0-9]/g, "");

      // Canonical store ID / storeCode lookup only (no fuzzy name matching)
      const store = (campaign.stores || []).find((s) => {
        const sCode = (s.storeCode || (s as any).code || "").trim().toLowerCase();
        const sId = (s.id || "").trim().toLowerCase();
        if (sCode === cleanCode || sId === cleanCode) return true;
        if (normCode && sCode.replace(/[^a-z0-9]/g, "") === normCode) return true;
        if (normCode && sId.replace(/[^a-z0-9]/g, "") === normCode) return true;
        return false;
      });

      if (!store) {
        return NextResponse.json({ error: "Store not found in campaign." }, { status: 404 });
      }

      if (store.isActive === false || (store as any).active === false) {
        return NextResponse.json(
          { error: "This store location is currently deactivated." },
          { status: 403 }
        );
      }

      // Check if BA already signed in via POST /api/auth (role === "ba") for this campaign & store
      const canonicalCodeForAuth = (store.storeCode || (store as any).code || store.id || storeCode).trim().toLowerCase();
      const callerSession = getRequestSession(request, true);
      const hasValidBaSession = Boolean(
        callerSession &&
          (callerSession.role === "superadmin" ||
            (callerSession.role === "supervisor" &&
              callerSession.campaignId?.toLowerCase() === cleanCampaignId) ||
            (callerSession.role === "ba" &&
              callerSession.campaignId?.toLowerCase() === cleanCampaignId &&
              callerSession.storeCode?.toLowerCase() === canonicalCodeForAuth))
      );

      const inputBaUser = String(
        body.baUsername ||
          (callerSession?.role === "ba" ? callerSession.username : "") ||
          store.baUsername ||
          ""
      )
        .trim()
        .toLowerCase();

      if (!hasValidBaSession) {
        // Verify BA Username (mandatory if configured on store) & store-specific Password / PIN
        const expectedBaUser = (store.baUsername || "").trim().toLowerCase();
        if (expectedBaUser && inputBaUser !== expectedBaUser) {
          return NextResponse.json(
            { error: `Incorrect or missing BA username for ${store.name}.` },
            { status: 401 }
          );
        }

        const effectivePin =
          (store.baPassword && store.baPassword.trim()) ||
          (store.pin && store.pin.trim()) ||
          "1234";
        const inputPin = String(pin || "").trim();
        if (!verifyPassword(inputPin, effectivePin)) {
          return NextResponse.json(
            { error: "Incorrect BA password or access PIN for this location." },
            { status: 401 }
          );
        }
      }

      // Credentials verified -> clear rate limit bucket
      resetRateLimit(rateKey);

      let targetLat = isValidCoordinates(store.lat, store.lng) ? store.lat! : 6.5244;
      let targetLng = isValidCoordinates(store.lat, store.lng) ? store.lng! : 3.3792;
      const resolvedUserLat = isValidCoordinates(latitude, longitude) ? latitude : targetLat;
      const resolvedUserLng = isValidCoordinates(latitude, longitude) ? longitude : targetLng;
      const radius = typeof store.geofenceRadius === "number" ? store.geofenceRadius : 200;

      let evalResult = {
        inside: true,
        distance: 0,
        status: "verified" as "verified" | "drift" | "out_of_bounds",
        message: "Direct check-in verified (geofence disabled for this event).",
      };

      if (geofenceRequired) {
        if (!isValidCoordinates(store.lat, store.lng)) {
          return NextResponse.json(
            {
              error: `Store GPS coordinates are not configured for ${store.name}. Ask a supervisor to calibrate this venue.`,
            },
            { status: 400 }
          );
        }

        targetLat = store.lat!;
        targetLng = store.lng!;

        evalResult = evaluateGeofence(
          { latitude: resolvedUserLat, longitude: resolvedUserLng, accuracy, timestamp },
          { latitude: targetLat, longitude: targetLng },
          radius,
          store.polygon
        );

        if (!evalResult.inside) {
          return NextResponse.json(
            {
              error: evalResult.message,
              evaluation: evalResult,
            },
            { status: 403 }
          );
        }
      }

      // Check if store already has an active check-in today
      const canonicalStoreCode = store.storeCode || (store as any).code || store.id || storeCode;
      const todayStr = getTodayDateStr();
      const existing = await getStoreTodayCheckIn(cleanCampaignId, canonicalStoreCode, todayStr);
      if (existing && existing.status !== "checked_out" && existing.status !== "rejected") {
        const shiftToken = createSessionToken({
          role: "ba",
          username: inputBaUser || baName.trim().toLowerCase(),
          campaignId: cleanCampaignId,
          storeCode: canonicalStoreCode,
          checkInId: existing.id,
          baName: existing.baName,
        });
        const res = NextResponse.json({
          success: true,
          alreadyCheckedIn: true,
          checkIn: existing,
          shiftToken,
          message: "A shift is already active for this store today.",
        });
        setSessionCookie(res, shiftToken, BA_SHIFT_COOKIE_NAME);
        return res;
      }

      // Analyze GPS telemetry & spoofing signals (only when geofence is enabled)
      const telemetry = geofenceRequired
        ? evaluateGpsTelemetry(
            { latitude: resolvedUserLat, longitude: resolvedUserLng, accuracy, timestamp },
            Array.isArray(gpsSamples) ? gpsSamples : undefined,
            Boolean(isSimulated)
          )
        : { spoofRisk: "low" as const, spoofReasons: [], freshnessOk: true };

      // Persist "flagged" status if indoor drift, simulated demo mode, or high spoof risk
      const status: CheckInStatus =
        geofenceRequired &&
        (evalResult.status === "drift" ||
          Boolean(isSimulated) ||
          telemetry.spoofRisk === "high")
          ? "flagged"
          : "verified";

      const photoSha256 = computeSha256Hex(photoUrl);

      const safeBaName = sanitizeInputText(store.baName || baName, 150) || "BA";
      const safeBaPhone = sanitizeInputText(baPhone || store.baPhone, 40);
      const safeDeviceId = deviceId ? sanitizeInputText(deviceId, 100) : undefined;

      const record: Omit<CheckInRecord, "id" | "createdAt" | "updatedAt"> = {
        campaignId: cleanCampaignId,
        storeCode: canonicalStoreCode,
        storeName: store.name,
        baName: safeBaName,
        baUsername: inputBaUser || undefined,
        baPhone: safeBaPhone,
        shiftDate: todayStr,
        checkInTime: new Date().toISOString(),
        checkInLat: resolvedUserLat,
        checkInLng: resolvedUserLng,
        checkInAccuracy: typeof accuracy === "number" ? Math.round(accuracy) : undefined,
        targetLat,
        targetLng,
        distanceMeters: Math.max(0, evalResult.distance),
        status,
        photoUrl,
        photoSha256,
        isSimulated: Boolean(isSimulated),
        spoofRisk: telemetry.spoofRisk,
        spoofReasons: telemetry.spoofReasons.length > 0 ? telemetry.spoofReasons : undefined,
        deviceId: safeDeviceId,
        samplesLogged: 0,
      };

      const { checkIn: created, alreadyExisted } = await recordCheckIn(record);

      const shiftToken = createSessionToken({
        role: "ba",
        username: inputBaUser || baName.trim().toLowerCase(),
        campaignId: cleanCampaignId,
        storeCode: canonicalStoreCode,
        checkInId: created.id,
        baName: created.baName,
      });

      const res = NextResponse.json({
        success: true,
        alreadyCheckedIn: alreadyExisted,
        checkIn: created,
        shiftToken,
        evaluation: evalResult,
        telemetry,
        isSimulated: Boolean(isSimulated),
      });
      setSessionCookie(res, shiftToken, BA_SHIFT_COOKIE_NAME);
      return res;
    }

    // ── 2. CONTINUOUS PRESENCE HEARTBEAT ACTION (Akida Live Tracking Parity) ──
    if (action === "heartbeat") {
      const { checkInId, latitude, longitude, accuracy, clientRequestId } = body;
      if (!checkInId || !isValidCoordinates(latitude, longitude)) {
        return NextResponse.json(
          { error: "checkInId and valid GPS coordinates are required for heartbeat." },
          { status: 400 }
        );
      }

      if (!isAuthorizedForShift(request, checkInId)) {
        return NextResponse.json(
          { error: "Unauthorized shift session for heartbeat." },
          { status: 401 }
        );
      }

      const result = await recordShiftHeartbeat({
        checkInId,
        latitude,
        longitude,
        accuracy: typeof accuracy === "number" ? Math.round(accuracy) : undefined,
        clientRequestId: typeof clientRequestId === "string" ? clientRequestId : undefined,
      });

      return NextResponse.json({
        success: true,
        checkIn: result.checkIn,
        inside: result.inside,
        distanceMeters: result.distanceMeters,
      });
    }

    // ── 3. CHECK-OUT ACTION ──
    if (action === "check_out") {
      const { checkInId, latitude, longitude, accuracy, notes } = body;
      if (!checkInId) {
        return NextResponse.json({ error: "checkInId is required." }, { status: 400 });
      }

      if (!isAuthorizedForShift(request, checkInId)) {
        return NextResponse.json(
          { error: "Unauthorized to check out this shift." },
          { status: 401 }
        );
      }

      const updated = await recordCheckOut({
        checkInId,
        latitude,
        longitude,
        accuracy: typeof accuracy === "number" ? Math.round(accuracy) : undefined,
        notes: notes !== undefined ? sanitizeInputText(notes, 2000) : undefined,
      });
      return NextResponse.json({ success: true, checkIn: updated });
    }

    // ── 4. SAMPLE COUNTER INCREMENT / DECREMENT ──
    if (action === "sample_counter") {
      const { checkInId, delta, clientRequestId } = body;
      if (!checkInId) {
        return NextResponse.json({ error: "checkInId is required." }, { status: 400 });
      }

      if (!isAuthorizedForShift(request, checkInId)) {
        return NextResponse.json(
          { error: "Unauthorized to update sample counter for this shift." },
          { status: 401 }
        );
      }

      const safeDelta = Number(delta) < 0 ? -1 : 1;
      const newTotal = await updateShiftSampleCounter(
        checkInId,
        safeDelta,
        typeof clientRequestId === "string" ? clientRequestId : undefined
      );
      return NextResponse.json({ success: true, samplesLogged: newTotal });
    }

    // ── 5. SUBMIT CONSUMER / MOTHER SURVEY (With Auto Geotagging & Brand-Prefixed Idempotency) ──
    if (action === "submit_survey") {
      const {
        respondentId,
        clientRequestId,
        campaignId,
        checkInId,
        storeCode,
        storeName,
        baName,
        surveyType,
        respondentName,
        respondentPhone,
        productSampled,
        tasteFeedback,
        purchasedOnShelf,
        packsPurchased,
        motherStage,
        dueOrBirthDate,
        diaperSizeIssued,
        currentBrandUsed,
        clinicType,
        hospitalName,
        marketingConsent,
        marketingConsentLabel,
        surveyAnswers,
        latitude,
        longitude,
        accuracy,
        notes,
      } = body;

      if (!campaignId || !checkInId || !storeCode || !respondentName?.trim()) {
        return NextResponse.json(
          { error: "Campaign, active shift, store, and respondent name are required." },
          { status: 400 }
        );
      }

      const cleanCampaignId = String(campaignId).trim().toLowerCase();

      if (!isAuthorizedForShift(request, checkInId, cleanCampaignId)) {
        return NextResponse.json(
          { error: "Unauthorized shift session. Please sign in to your shift again." },
          { status: 401 }
        );
      }

      const [shiftRecord, campaign] = await Promise.all([
        getCheckInById(checkInId),
        getCampaign(cleanCampaignId),
      ]);
      if (!shiftRecord || shiftRecord.status === "rejected") {
        return NextResponse.json(
          { error: "Cannot submit surveys to a missing or rejected shift." },
          { status: 400 }
        );
      }
      // Block fresh online submissions to a checked_out shift unless it is a late-syncing offline queue item with a clientRequestId
      if (shiftRecord.status === "checked_out" && !clientRequestId) {
        return NextResponse.json(
          { error: "Cannot submit new surveys to a closed shift." },
          { status: 400 }
        );
      }

      const hasCoords = isValidCoordinates(latitude, longitude);
      let surveyDistance: number | undefined;
      if (hasCoords && isValidCoordinates(shiftRecord.targetLat, shiftRecord.targetLng)) {
        const d = calculateDistanceMeters(
          { latitude, longitude },
          { latitude: shiftRecord.targetLat, longitude: shiftRecord.targetLng }
        );
        if (d !== Infinity) surveyDistance = d;
      }

      const mode: SurveyType = surveyType === "hospital" ? "hospital" : "retail";
      const validFeedback: TasteFeedback[] = ["loved_it", "good", "neutral", "disliked"];

      const cleanAnswers = sanitizeKeyValueMap(surveyAnswers, 40, 60, 400);
      const cleanRespondentName = sanitizeInputText(respondentName, 120);
      const cleanRespondentPhone = sanitizeInputText(respondentPhone, 40);

      if (!cleanRespondentName) {
        return NextResponse.json(
          { error: "Valid respondent name is required." },
          { status: 400 }
        );
      }

      // Server-side idempotency-aware uniqueValue enforcement (e.g., Mother's Phone Number)
      if (campaign?.surveyQuestions?.some((q) => q.uniqueValue)) {
        const existingSurveys = await getDailySurveys(
          cleanCampaignId,
          shiftRecord.shiftDate || getTodayDateStr()
        );
        const resolvedCandidateId = generateRespondentId(
          campaign,
          respondentId,
          clientRequestId
        );
        const dup = findDuplicateUniqueSurveyAnswer({
          questions: campaign.surveyQuestions,
          incomingAnswers: cleanAnswers,
          incomingPhone: cleanRespondentPhone,
          existingSurveys,
          currentRespondentId: resolvedCandidateId,
          currentClientRequestId: typeof clientRequestId === "string" ? clientRequestId : undefined,
        });
        if (dup) {
          return NextResponse.json(
            {
              error: `Duplicate value detected for "${dup.questionLabel}" ("${dup.duplicateValue}"). Each entry must be unique.`,
            },
            { status: 409 }
          );
        }
      }

      // Authoritative shift attribution: always bind storeCode, storeName, and baName from verified shiftRecord
      const { survey, samplesLogged, alreadyExisted } = await recordSurvey(
        {
          respondentId: typeof respondentId === "string" ? respondentId : undefined,
          clientRequestId: typeof clientRequestId === "string" ? clientRequestId : undefined,
          campaignId: shiftRecord.campaignId || cleanCampaignId,
          checkInId: shiftRecord.id,
          storeCode: shiftRecord.storeCode || sanitizeInputText(storeCode, 80),
          storeName: shiftRecord.storeName || sanitizeInputText(storeName || storeCode, 150),
          baName: shiftRecord.baName || sanitizeInputText(baName, 120) || "BA",
          shiftDate: shiftRecord.shiftDate || getTodayDateStr(),
          surveyType: mode,
          respondentName: cleanRespondentName,
          respondentPhone: cleanRespondentPhone,
          productSampled:
            mode === "retail" && productSampled
              ? sanitizeInputText(productSampled, 120)
              : undefined,
          tasteFeedback:
            mode === "retail" && validFeedback.includes(tasteFeedback) ? tasteFeedback : undefined,
          purchasedOnShelf: mode === "retail" ? Boolean(purchasedOnShelf) : undefined,
          packsPurchased:
            mode === "retail" && purchasedOnShelf
              ? Math.max(1, Math.min(100, Number(packsPurchased) || 1))
              : undefined,
          clinicType:
            mode === "hospital" && clinicType
              ? sanitizeInputText(clinicType, 60)
              : undefined,
          hospitalName:
            mode === "hospital" && hospitalName
              ? sanitizeInputText(hospitalName, 150)
              : undefined,
          marketingConsent:
            mode === "hospital" && typeof marketingConsent === "boolean"
              ? marketingConsent
              : undefined,
          marketingConsentLabel:
            mode === "hospital" && marketingConsentLabel
              ? sanitizeInputText(marketingConsentLabel, 300)
              : undefined,
          motherStage:
            mode === "hospital" && (motherStage === "expectant" || motherStage === "nursing")
              ? motherStage
              : undefined,
          dueOrBirthDate:
            mode === "hospital" && dueOrBirthDate
              ? sanitizeInputText(dueOrBirthDate, 50)
              : undefined,
          diaperSizeIssued:
            mode === "hospital" &&
            (diaperSizeIssued === "Newborn (Size 1)" ||
              diaperSizeIssued === "Size 2" ||
              diaperSizeIssued === "Size 3")
              ? diaperSizeIssued
              : undefined,
          currentBrandUsed:
            mode === "hospital" && currentBrandUsed
              ? sanitizeInputText(currentBrandUsed, 80)
              : undefined,
          surveyAnswers: cleanAnswers,
          lat: hasCoords ? latitude : undefined,
          lng: hasCoords ? longitude : undefined,
          accuracy: hasCoords && typeof accuracy === "number" ? Math.round(accuracy) : undefined,
          distanceMeters: surveyDistance,
          notes: notes ? sanitizeInputText(notes, 500) : undefined,
        },
        campaign
      );

      return NextResponse.json({
        success: true,
        survey,
        samplesLogged,
        alreadyExisted,
      });
    }

    // ── 6. SUPERVISOR REVIEW FLAGGED CHECK-IN (Approve / Reject) ──
    if (action === "review_checkin") {
      const { checkInId, decision, reviewNote, campaignId } = body;
      const session = getRequestSession(request, false);
      if (
        !session ||
        (session.role !== "superadmin" &&
          !(
            session.role === "supervisor" &&
            (!campaignId || session.campaignId?.toLowerCase() === String(campaignId).toLowerCase())
          ))
      ) {
        return NextResponse.json(
          { error: "Supervisor authentication required to review flagged check-ins." },
          { status: 401 }
        );
      }

      if (!checkInId || (decision !== "approved" && decision !== "rejected")) {
        return NextResponse.json(
          { error: "checkInId and valid decision ('approved' | 'rejected') are required." },
          { status: 400 }
        );
      }

      const updated = await reviewCheckInRecord({
        checkInId: sanitizeInputText(checkInId, 120),
        decision,
        reviewedBy: sanitizeInputText(session.username, 120),
        reviewNote: reviewNote ? sanitizeInputText(reviewNote, 1000) : undefined,
      });

      return NextResponse.json({
        success: true,
        checkIn: updated,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error("POST /api/checkin error:", err);
    return NextResponse.json(
      { error: "Failed to process check-in request." },
      { status: 500 }
    );
  }
}
