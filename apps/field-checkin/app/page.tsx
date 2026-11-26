"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  MapPin, ShieldCheck, CheckCircle2, AlertTriangle,
  Camera, Clock, RefreshCw, X, ChevronRight, Navigation,
  Smartphone, Award, User, Phone, LogOut, Plus, Minus,
  ClipboardList, ListChecks, Send, ShoppingBag, HeartPulse,
} from "lucide-react";
import type { Campaign, StoreLocation, CheckInRecord, GeoPoint, SurveyRecord, SurveyType, TasteFeedback, SurveyQuestion } from "@/lib/types";
import {
  DEFAULT_HOSPITAL_QUESTIONS,
  generateRespondentId,
  generateClientRequestId,
} from "@/lib/survey-templates";
import { evaluateGeofence, formatDistance } from "@/lib/geo";
import { drawGpsWatermark } from "@/lib/watermark";
import GeofenceMap from "@/components/GeofenceMap";

type DemoMode = "real" | "on_site" | "out_of_bounds";

interface OfflineQueuedSurvey {
  id: string;
  queuedAt: number;
  payload: Record<string, any>;
}

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("field_ops_device_id");
  if (!id) {
    id = `dev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem("field_ops_device_id", id);
  }
  return id;
}

function CheckInContent() {
  const searchParams = useSearchParams();
  const campaignSlug = searchParams.get("c") || "golden-morn";

  // Campaign & Store state
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadingCampaign, setLoadingCampaign] = useState(true);
  const [selectedStore, setSelectedStore] = useState<StoreLocation | null>(null);

  // Form inputs
  const [baName, setBaName] = useState("");
  const [baUsername, setBaUsername] = useState("");
  const [baPhone, setBaPhone] = useState("");
  const [baPin, setBaPin] = useState("");

  // Demo simulator state
  const [demoMode, setDemoMode] = useState<DemoMode>("real");

  // GPS / Location state
  const [coords, setCoords] = useState<GeoPoint | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");

  // Selfie Camera state (In-App Camera Capture, No File Picker)
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [watermarking, setWatermarking] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // BA Sign-In Gate state (Step 1: Sign In -> Step 2: Geofenced Check-In -> Step 3: Survey -> Check-Out)
  const [baAuthenticated, setBaAuthenticated] = useState(false);
  const [baSignInLoading, setBaSignInLoading] = useState(false);
  const [baSignInError, setBaSignInError] = useState("");

  // Active shift state (persisted to localStorage + validated against server)
  const [activeShift, setActiveShift] = useState<CheckInRecord | null>(null);
  const [shiftToken, setShiftToken] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [shiftElapsed, setShiftElapsed] = useState("");
  const [heartbeatPinging, setHeartbeatPinging] = useState(false);

  // Rolling GPS multi-fix buffer for anti-spoofing telemetry
  const gpsSamplesRef = useRef<GeoPoint[]>([]);

  // Offline Queue & Network Status (Akida Offline Auto-Sync Parity)
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedSurvey[]>([]);
  const [syncingOffline, setSyncingOffline] = useState(false);

  // Sample counter incrementing state
  const [counterLoading, setCounterLoading] = useState(false);

  // Separate Survey Architecture state (Active Shift Tabs: "survey" | "submissions" | "shift")
  const [activeTab, setActiveTab] = useState<"survey" | "submissions" | "shift">("survey");
  const [shiftSurveys, setShiftSurveys] = useState<SurveyRecord[]>([]);
  const [surveyMode, setSurveyMode] = useState<SurveyType>("retail");
  const [respondentName, setRespondentName] = useState("");
  const [respondentPhone, setRespondentPhone] = useState("");
  const [productSampled, setProductSampled] = useState("Golden Morn Maize & Soya (45g)");
  const [tasteFeedback, setTasteFeedback] = useState<TasteFeedback>("loved_it");
  const [purchasedOnShelf, setPurchasedOnShelf] = useState(false);
  const [packsPurchased, setPacksPurchased] = useState(1);
  const [motherStage, setMotherStage] = useState<"expectant" | "nursing">("nursing");
  const [dueOrBirthDate, setDueOrBirthDate] = useState("");
  const [diaperSizeIssued, setDiaperSizeIssued] = useState<"Newborn (Size 1)" | "Size 2" | "Size 3">("Newborn (Size 1)");
  const [currentBrandUsed, setCurrentBrandUsed] = useState("Molfix");
  const [clinicType, setClinicType] = useState("ANC");
  const [hospitalName, setHospitalName] = useState("");
  const [marketingConsent, setMarketingConsent] = useState<boolean | null>(null);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [surveyNotes, setSurveyNotes] = useState("");
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [surveySuccessMsg, setSurveySuccessMsg] = useState("");
  const [surveyErrorMsg, setSurveyErrorMsg] = useState("");
  const currentDraftIdsRef = useRef<{ respondentId: string; clientRequestId: string } | null>(null);

  function getShiftAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (shiftToken) {
      headers["Authorization"] = `Bearer ${shiftToken}`;
    }
    return headers;
  }

  // ── Load Campaign via Sanitized Public API (With Offline Local Cache Fallback) & Re-validate Cached Shift ──
  useEffect(() => {
    async function load() {
      try {
        setLoadingCampaign(true);
        let data: Campaign | null = null;
        try {
          const res = await fetch(`/api/campaigns?slug=${encodeURIComponent(campaignSlug)}&public=1`);
          const json = await res.json();
          if (res.ok && json.success && json.campaign) {
            data = json.campaign;
            localStorage.setItem(`field_ops_cached_campaign_${campaignSlug}`, JSON.stringify(data));
          }
        } catch {
          // Offline fallback: hydrate campaign from localStorage cache
          try {
            const cachedCamp = localStorage.getItem(`field_ops_cached_campaign_${campaignSlug}`);
            if (cachedCamp) data = JSON.parse(cachedCamp);
          } catch {}
        }

        setCampaign(data);
        if (data?.activationType === "hospital" || data?.activationType === "retail") {
          setSurveyMode(data.activationType);
        }

        const cachedToken = localStorage.getItem(`active_shift_token_${campaignSlug}`) || "";
        if (cachedToken) setShiftToken(cachedToken);

        // Verify existing BA session cookie / token (with offline cached profile fallback)
        let verifiedBaStoreCode = "";
        try {
          const authRes = await fetch("/api/auth?role=ba", {
            headers: cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {},
          });
          if (authRes.ok) {
            const authJson = await authRes.json();
            const u = authJson.user;
            if (
              authJson.authenticated &&
              u?.role === "ba" &&
              u?.campaignId?.toLowerCase() === campaignSlug.toLowerCase()
            ) {
              setBaAuthenticated(true);
              verifiedBaStoreCode = String(u.storeCode || "").toLowerCase();
              setBaName(u.baName || u.username || "BA");
              if (u.username) setBaUsername(u.username);
              if (u.storeCode && data?.stores) {
                const matchedStore = data.stores.find(
                  (s) =>
                    (s.storeCode || (s as any).code || s.id || "").toLowerCase() ===
                      verifiedBaStoreCode ||
                    (s.baUsername || "").toLowerCase() === String(u.username || "").toLowerCase()
                );
                if (matchedStore) {
                  setSelectedStore(matchedStore);
                  if (matchedStore.baName && !u.baName) setBaName(matchedStore.baName);
                  if (matchedStore.baPhone) setBaPhone(matchedStore.baPhone);
                }
              }
            }
          } else if (authRes.status === 401) {
            localStorage.removeItem(`active_shift_token_${campaignSlug}`);
            localStorage.removeItem(`field_ops_ba_profile_${campaignSlug}`);
            setShiftToken("");
          }
        } catch {
          // Offline during refresh: restore BA profile from localStorage if token exists
          if (cachedToken) {
            try {
              const rawProfile = localStorage.getItem(`field_ops_ba_profile_${campaignSlug}`);
              if (rawProfile) {
                const prof = JSON.parse(rawProfile);
                setBaAuthenticated(true);
                verifiedBaStoreCode = String(prof.storeCode || "").toLowerCase();
                if (prof.store) setSelectedStore(prof.store);
                if (prof.baName) setBaName(prof.baName);
                if (prof.baPhone) setBaPhone(prof.baPhone);
                if (prof.username) setBaUsername(prof.username);
              }
            } catch {}
          }
        }

        const cachedQueue = localStorage.getItem(`offline_queue_${campaignSlug}`);
        if (cachedQueue) {
          try {
            setOfflineQueue(JSON.parse(cachedQueue));
          } catch {}
        }

        // Check if BA already has an active shift saved locally (must match signed-in store)
        const cached = localStorage.getItem(`active_shift_${campaignSlug}`);
        if (cached && verifiedBaStoreCode) {
          try {
            const parsed = JSON.parse(cached) as CheckInRecord;
            if ((parsed.storeCode || "").toLowerCase() === verifiedBaStoreCode) {
              setActiveShift(parsed);
            } else {
              localStorage.removeItem(`active_shift_${campaignSlug}`);
            }
          } catch {}
        }
      } catch (err) {
        console.error("Failed to load campaign for check-in:", err);
      } finally {
        setLoadingCampaign(false);
      }
    }
    load();
  }, [campaignSlug]);

  // ── Online / Offline Detection & Auto-Sync ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  async function syncOfflineQueue() {
    if (syncingOffline || offlineQueue.length === 0) return;
    setSyncingOffline(true);
    const remaining: OfflineQueuedSurvey[] = [];
    let latestShift: CheckInRecord | null = activeShift;
    for (const item of offlineQueue) {
      try {
        const payloadToSync =
          item.payload?.action === "submit_survey"
            ? {
                ...item.payload,
                respondentId: item.payload.respondentId || item.id,
                clientRequestId: item.payload.clientRequestId || item.id,
              }
            : item.payload;
        const res = await fetch("/api/checkin", {
          method: "POST",
          headers: getShiftAuthHeaders(),
          body: JSON.stringify(payloadToSync),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.checkIn) {
            latestShift = data.checkIn;
            setActiveShift(data.checkIn);
            localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(data.checkIn));
          }
          if (data.survey) {
            setShiftSurveys((prev) => [
              data.survey,
              ...prev.filter(
                (s) =>
                  s.id !== item.id &&
                  s.id !== data.survey.id &&
                  (!s.clientRequestId || s.clientRequestId !== data.survey.clientRequestId)
              ),
            ]);
          }
          if (typeof data.samplesLogged === "number" && latestShift) {
            latestShift = { ...latestShift, samplesLogged: data.samplesLogged };
            setActiveShift(latestShift);
            localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(latestShift));
          }
        } else if (res.status === 401 || res.status === 403 || res.status >= 500) {
          remaining.push(item);
          if (res.status === 401 || res.status === 403) {
            setSubmitError(
              "Your BA shift session expired while offline. Please sign in again to sync your queued items."
            );
          }
        }
      } catch {
        remaining.push(item);
      }
    }
    setOfflineQueue(remaining);
    if (remaining.length > 0) {
      localStorage.setItem(`offline_queue_${campaignSlug}`, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(`offline_queue_${campaignSlug}`);
    }
    setSyncingOffline(false);
  }

  useEffect(() => {
    if (isOnline && offlineQueue.length > 0 && activeShift) {
      syncOfflineQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, activeShift?.id]);

  // ── Shift Elapsed Timer ──
  useEffect(() => {
    if (!activeShift?.checkInTime) return;

    function updateTimer() {
      const start = new Date(activeShift!.checkInTime).getTime();
      const now = Date.now();
      const diffMs = Math.max(0, now - start);

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

      if (hours > 0) {
        setShiftElapsed(`${hours}h ${mins}m`);
      } else {
        setShiftElapsed(`${mins}m ${secs}s`);
      }
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeShift]);

  // ── Load Shift Surveys & Re-validate Active Shift against Server ──
  useEffect(() => {
    if (!activeShift?.id) {
      setShiftSurveys([]);
      return;
    }
    async function loadShiftSurveys() {
      try {
        const res = await fetch(
          `/api/checkin?campaignId=${encodeURIComponent(campaignSlug)}&checkInId=${encodeURIComponent(activeShift!.id)}`,
          { headers: shiftToken ? { Authorization: `Bearer ${shiftToken}` } : {} }
        );
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.checkIn) {
            if (data.checkIn.status === "checked_out" || data.checkIn.status === "rejected") {
              localStorage.removeItem(`active_shift_${campaignSlug}`);
              localStorage.removeItem(`active_shift_token_${campaignSlug}`);
              setActiveShift(null);
              return;
            }
            setActiveShift(data.checkIn);
            localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(data.checkIn));
          }
          if (Array.isArray(data.surveys)) {
            setShiftSurveys(data.surveys);
          }
        }
      } catch (err) {
        console.warn("Could not load shift surveys:", err);
      }
    }
    loadShiftSurveys();
  }, [activeShift?.id, campaignSlug]);

  // Active configured questions: campaign-level custom questions, or default Hospital (ANC/IMC + Consent) when in hospital mode
  const activeQuestions: SurveyQuestion[] | null =
    campaign?.surveyQuestions && campaign.surveyQuestions.length > 0
      ? campaign.surveyQuestions
      : surveyMode === "hospital"
      ? DEFAULT_HOSPITAL_QUESTIONS
      : null;

  // Initialize auto-filled defaults when activeShift or activeQuestions change
  useEffect(() => {
    if (!activeShift) return;
    if (!hospitalName) {
      setHospitalName(activeShift.storeName || "");
    }
    if (activeQuestions) {
      setCustomAnswers((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const q of activeQuestions) {
          if (q.autoFillStoreName && !next[q.id]) {
            next[q.id] = activeShift.storeName || "";
            changed = true;
          } else if (q.type === "select" && q.options?.length && !next[q.id]) {
            next[q.id] = q.options[0];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShift?.id, campaign?.id, surveyMode]);

  function shouldShowQuestion(q: SurveyQuestion): boolean {
    if (!q.skipIfQuestionId) return true;
    const parentAns = (customAnswers[q.skipIfQuestionId] || "").trim().toLowerCase();
    const expected = (q.skipIfAnswer || "").trim().toLowerCase();
    if (!expected) return parentAns.length > 0;
    return parentAns === expected || parentAns.split(",").map((s) => s.trim()).includes(expected);
  }

  // ── Submit Consumer / Mother Survey (With Auto Geotagging & Offline Queue Fallback) ──
  async function handleSurveySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeShift) return;

    // Extract name/phone/clinic/hospital/consent cleanly from either customQuestions or standard fields
    let resolvedName = respondentName.trim();
    let resolvedPhone = respondentPhone.trim();
    let resolvedClinic = clinicType;
    let resolvedHospital = hospitalName.trim() || activeShift.storeName;
    let resolvedConsent = marketingConsent;
    let resolvedConsentLabel: string | undefined;

    if (activeQuestions) {
      // Enforce Akida-style question validations (required, numericOnly, maxDigits, uniqueValue)
      for (const q of activeQuestions) {
        if (!shouldShowQuestion(q)) continue;
        const rawAns = (customAnswers[q.id] || "").trim();
        if (q.required && !rawAns) {
          setSurveyErrorMsg(`Please answer required question: "${q.label}".`);
          return;
        }
        if (rawAns && (q.numericOnly || q.type === "number")) {
          const digitsOnly = rawAns.replace(/[\s\-+]/g, "");
          if (!/^\d+$/.test(digitsOnly)) {
            setSurveyErrorMsg(`"${q.label}" accepts numbers only.`);
            return;
          }
          if (q.maxDigits && digitsOnly.length > q.maxDigits) {
            setSurveyErrorMsg(`"${q.label}" must be at most ${q.maxDigits} digits.`);
            return;
          }
        } else if (rawAns && q.maxDigits && rawAns.length > q.maxDigits) {
          setSurveyErrorMsg(`"${q.label}" must be at most ${q.maxDigits} characters.`);
          return;
        }
        if (rawAns && q.uniqueValue) {
          const dup = shiftSurveys.some((prev) => {
            const prevVal = (
              prev.surveyAnswers?.[q.id] ||
              (q.type === "tel" ? prev.respondentPhone : "") ||
              ""
            )
              .trim()
              .toLowerCase();
            return prevVal && prevVal === rawAns.toLowerCase();
          });
          if (dup) {
            setSurveyErrorMsg(
              `Duplicate value detected for "${q.label}" ("${rawAns}"). Each entry must be unique.`
            );
            return;
          }
        }
      }

      const nameQ = activeQuestions.find(
        (q) =>
          q.id.includes("name") && !q.id.includes("hospital") && !q.id.includes("store")
      ) || activeQuestions[0];
      const phoneQ = activeQuestions.find((q) => q.type === "tel" || q.id.includes("phone"));
      const clinicQ = activeQuestions.find((q) => q.id.includes("clinic"));
      const hospitalQ = activeQuestions.find(
        (q) => q.autoFillStoreName || q.id.includes("hospital")
      );
      const consentQ = activeQuestions.find((q) => q.type === "radio_consent");

      if (nameQ) resolvedName = (customAnswers[nameQ.id] || "").trim();
      if (phoneQ) resolvedPhone = (customAnswers[phoneQ.id] || "").trim();
      if (clinicQ) resolvedClinic = (customAnswers[clinicQ.id] || "ANC").trim();
      if (hospitalQ) resolvedHospital = (customAnswers[hospitalQ.id] || activeShift.storeName).trim();
      if (consentQ) {
        const ans = customAnswers[consentQ.id] || "";
        resolvedConsentLabel = ans || undefined;
        resolvedConsent = ans.toLowerCase().startsWith("yes");
      }
    }

    if (!resolvedName) {
      setSurveyErrorMsg("Please enter the respondent's name.");
      return;
    }

    setSurveySubmitting(true);
    setSurveyErrorMsg("");
    setSurveySuccessMsg("");

    if (!currentDraftIdsRef.current) {
      currentDraftIdsRef.current = {
        respondentId: generateRespondentId(campaign || { id: campaignSlug }),
        clientRequestId: generateClientRequestId(),
      };
    }
    const draftIds = currentDraftIdsRef.current;

    const surveyPayload = {
      action: "submit_survey",
      respondentId: draftIds.respondentId,
      clientRequestId: draftIds.clientRequestId,
      campaignId: campaignSlug,
      checkInId: activeShift.id,
      storeCode: activeShift.storeCode,
      storeName: activeShift.storeName,
      baName: activeShift.baName,
      surveyType: surveyMode,
      respondentName: resolvedName,
      respondentPhone: resolvedPhone,
      productSampled: !activeQuestions && surveyMode === "retail" ? productSampled : undefined,
      tasteFeedback: !activeQuestions && surveyMode === "retail" ? tasteFeedback : undefined,
      purchasedOnShelf: !activeQuestions && surveyMode === "retail" ? purchasedOnShelf : undefined,
      packsPurchased:
        !activeQuestions && surveyMode === "retail" && purchasedOnShelf ? packsPurchased : undefined,
      clinicType: surveyMode === "hospital" ? resolvedClinic : undefined,
      hospitalName: surveyMode === "hospital" ? resolvedHospital : undefined,
      marketingConsent:
        typeof resolvedConsent === "boolean" ? resolvedConsent : undefined,
      marketingConsentLabel: resolvedConsentLabel,
      surveyAnswers: activeQuestions ? customAnswers : undefined,
      latitude: coords?.latitude ?? activeShift.lastLat ?? activeShift.checkInLat,
      longitude: coords?.longitude ?? activeShift.lastLng ?? activeShift.checkInLng,
      accuracy: coords?.accuracy ?? activeShift.checkInAccuracy,
      notes: surveyNotes.trim() || undefined,
    };

    const resetSurveyFields = () => {
      currentDraftIdsRef.current = null;
      setRespondentName("");
      setRespondentPhone("");
      setPurchasedOnShelf(false);
      setPacksPurchased(1);
      setDueOrBirthDate("");
      setMarketingConsent(null);
      setSurveyNotes("");
      if (activeQuestions) {
        const nextAns: Record<string, string> = {};
        for (const q of activeQuestions) {
          if (q.autoFillStoreName) {
            nextAns[q.id] = activeShift.storeName || "";
          } else if (q.type === "select" && q.options?.length) {
            nextAns[q.id] = q.options[0];
          }
        }
        setCustomAnswers(nextAns);
      }
    };

    const queueOfflineSurvey = () => {
      const tempId = draftIds.respondentId;
      if (offlineQueue.some((q) => q.id === tempId || q.payload?.clientRequestId === draftIds.clientRequestId)) {
        resetSurveyFields();
        return;
      }
      const newItem: OfflineQueuedSurvey = {
        id: tempId,
        queuedAt: Date.now(),
        payload: surveyPayload,
      };
      const nextQueue = [...offlineQueue, newItem];
      setOfflineQueue(nextQueue);
      localStorage.setItem(`offline_queue_${campaignSlug}`, JSON.stringify(nextQueue));

      const optimisticSurvey: SurveyRecord = {
        id: tempId,
        clientRequestId: draftIds.clientRequestId,
        campaignId: campaignSlug,
        checkInId: activeShift.id,
        storeCode: activeShift.storeCode,
        storeName: activeShift.storeName,
        baName: activeShift.baName,
        shiftDate: activeShift.shiftDate,
        surveyType: surveyMode,
        respondentName: resolvedName,
        respondentPhone: resolvedPhone,
        productSampled: surveyPayload.productSampled,
        tasteFeedback: surveyPayload.tasteFeedback,
        purchasedOnShelf: surveyPayload.purchasedOnShelf,
        packsPurchased: surveyPayload.packsPurchased,
        clinicType: surveyPayload.clinicType,
        hospitalName: surveyPayload.hospitalName,
        marketingConsent: surveyPayload.marketingConsent,
        marketingConsentLabel: surveyPayload.marketingConsentLabel,
        surveyAnswers: surveyPayload.surveyAnswers,
        lat: surveyPayload.latitude,
        lng: surveyPayload.longitude,
        accuracy: surveyPayload.accuracy,
        notes: surveyPayload.notes,
        createdAt: Date.now(),
      };
      setShiftSurveys((prev) => [
        optimisticSurvey,
        ...prev.filter((s) => s.id !== tempId && s.clientRequestId !== draftIds.clientRequestId),
      ]);
      const updatedShift = { ...activeShift, samplesLogged: (activeShift.samplesLogged || 0) + 1 };
      setActiveShift(updatedShift);
      localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(updatedShift));

      resetSurveyFields();
      setSurveySuccessMsg(`📦 Saved offline (${tempId}) for ${resolvedName}! Will auto-sync when signal returns.`);
      setTimeout(() => setSurveySuccessMsg(""), 5000);
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      queueOfflineSurvey();
      setSurveySubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: getShiftAuthHeaders(),
        body: JSON.stringify(surveyPayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSurveyErrorMsg(data.error || "Failed to save survey response.");
        return;
      }

      if (data.survey) {
        setShiftSurveys((prev) => [
          data.survey,
          ...prev.filter(
            (s) =>
              s.id !== data.survey.id &&
              (!s.clientRequestId || s.clientRequestId !== data.survey.clientRequestId)
          ),
        ]);
      }
      const nextCount = typeof data.samplesLogged === "number" && data.samplesLogged > 0
        ? data.samplesLogged
        : (activeShift.samplesLogged || 0) + 1;
      const updatedShift = { ...activeShift, samplesLogged: nextCount };
      setActiveShift(updatedShift);
      localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(updatedShift));

      resetSurveyFields();
      setSurveySuccessMsg(
        `✅ Survey saved (${data.survey?.id || draftIds.respondentId}) for ${resolvedName}! Ready for next respondent.`
      );
      setTimeout(() => setSurveySuccessMsg(""), 4000);
    } catch (err) {
      console.warn("Network unreachable during survey submit — queueing offline:", err);
      queueOfflineSurvey();
    } finally {
      setSurveySubmitting(false);
    }
  }

  // ── Acquire GPS Coordinates (or apply demo mode) ──
  function acquireLocation(mode: DemoMode = demoMode, store = selectedStore) {
    setGpsError("");

    if (mode === "on_site") {
      // Simulate on-site: 25 meters offset from store target
      const lat = store?.lat ?? 6.7148;
      const lng = store?.lng ?? 3.4025;
      const fix: GeoPoint = {
        latitude: lat + 0.00015,
        longitude: lng + 0.00012,
        accuracy: 8,
        timestamp: Date.now(),
      };
      setCoords(fix);
      gpsSamplesRef.current = [...gpsSamplesRef.current.slice(-4), fix];
      return;
    }

    if (mode === "out_of_bounds") {
      // Simulate 600m away
      const lat = store?.lat ?? 6.7148;
      const lng = store?.lng ?? 3.4025;
      const fix: GeoPoint = {
        latitude: lat + 0.0055,
        longitude: lng + 0.0048,
        accuracy: 15,
        timestamp: Date.now(),
      };
      setCoords(fix);
      gpsSamplesRef.current = [...gpsSamplesRef.current.slice(-4), fix];
      return;
    }

    // Real device GPS
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGpsError("Geolocation is not supported by your mobile browser.");
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix: GeoPoint = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          timestamp: pos.timestamp || Date.now(),
        };
        setCoords(fix);
        gpsSamplesRef.current = [...gpsSamplesRef.current.slice(-4), fix];
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(err.message || "Could not retrieve GPS location.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  // Auto-acquire location when store changes
  useEffect(() => {
    if (selectedStore && !activeShift) {
      acquireLocation(demoMode, selectedStore);
    }
  }, [selectedStore, demoMode]);

  // Live GPS stream (Real GPS mode) — keeps the blue dot moving & collects multi-fix telemetry
  useEffect(() => {
    if (demoMode !== "real") return;
    if (!selectedStore && !activeShift) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fix: GeoPoint = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          timestamp: pos.timestamp || Date.now(),
        };
        setCoords(fix);
        gpsSamplesRef.current = [...gpsSamplesRef.current.slice(-4), fix];
        setGpsError("");
      },
      () => {
        /* one-shot acquireLocation already surfaces errors */
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [demoMode, selectedStore, activeShift]);

  // ── Continuous Presence Heartbeat While Shift Is Active (Every 3 minutes) ──
  async function sendPresenceHeartbeat(manual = false) {
    if (!activeShift || !coords) return;
    if (manual) setHeartbeatPinging(true);
    const clientRequestId = generateClientRequestId();
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: getShiftAuthHeaders(),
        body: JSON.stringify({
          action: "heartbeat",
          checkInId: activeShift.id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          clientRequestId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.checkIn) {
        setActiveShift(data.checkIn);
        localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(data.checkIn));
      }
    } catch (err) {
      console.warn("Heartbeat ping skipped (offline):", err);
    } finally {
      if (manual) setHeartbeatPinging(false);
    }
  }

  useEffect(() => {
    if (!activeShift?.id) return;
    const timer = setInterval(() => {
      sendPresenceHeartbeat(false);
    }, 3 * 60 * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShift?.id, coords?.latitude, coords?.longitude]);

  // ── Camera Selfie Handlers (Real webcam snap, zero file picker) ──
  async function startCamera() {
    setCameraError("");
    setCameraStarting(true);
    setIsCameraOpen(true);

    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API is not supported in this browser.");
      }

      // Stop any stale stream first
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      let msg = "Could not access camera. Please allow camera permissions.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Camera permission was denied. Please allow camera access in your browser address bar.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        msg = "No camera hardware detected on this device.";
      }
      setCameraError(msg);
    } finally {
      setCameraStarting(false);
    }
  }

  function stopCamera() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setCameraError("");
  }

  async function snapSelfie() {
    const video = videoRef.current;
    if (!video || watermarking) return;

    // Cap resolution so the base64 JPEG stays well under Firestore's 1MB doc limit
    const srcW = video.videoWidth || 640;
    const srcH = video.videoHeight || 480;
    const scale = Math.min(1, 960 / srcW);
    const width = Math.round(srcW * scale);
    const height = Math.round(srcH * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror image horizontally to match the front-camera mirror viewfinder
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);

    // Frame is now frozen on the canvas — release camera hardware immediately
    const snapTime = new Date();
    stopCamera();
    setWatermarking(true);

    try {
      // Burn the GPS Map Camera evidence banner (transform is reset inside)
      await drawGpsWatermark(canvas, {
        locationName: selectedStore?.name || "Unassigned Location",
        address: [selectedStore?.address, selectedStore?.city || selectedStore?.state]
          .filter(Boolean)
          .join(", ") || undefined,
        baName: baName.trim() || undefined,
        userLat: coords?.latitude,
        userLng: coords?.longitude,
        accuracy: coords?.accuracy,
        targetLat: selectedStore?.lat,
        targetLng: selectedStore?.lng,
        geofenceRadius: selectedStore?.geofenceRadius || 200,
        distanceMeters: geofence?.distance,
        status: geofence?.status ?? "pending",
        timestamp: snapTime,
        isSimulated: demoMode !== "real",
      });
    } catch (err) {
      // Never block check-in because of a watermark failure — keep the raw frame
      console.error("Watermark render failed:", err);
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPhotoDataUrl(dataUrl);
    setSubmitError("");
    setWatermarking(false);
  }

  // Ensure camera stream attaches when camera opens
  useEffect(() => {
    if (isCameraOpen && mediaStreamRef.current && videoRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraOpen]);

  // Ensure camera stream is stopped if component unmounts
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── Geofence Evaluation (Never fall back to user's own position if store is uncalibrated) ──
  const storeTarget: GeoPoint = {
    latitude: typeof selectedStore?.lat === "number" ? selectedStore.lat : NaN,
    longitude: typeof selectedStore?.lng === "number" ? selectedStore.lng : NaN,
  };

  const isGeofenceEnabled = campaign?.geofenceEnabled !== false;
  const activeRadius = selectedStore?.geofenceRadius || 200;

  const geofence =
    isGeofenceEnabled && coords && selectedStore
      ? evaluateGeofence(coords, storeTarget, activeRadius, selectedStore.polygon)
      : null;

  // ── Step 1: BA Sign-In Handler ──
  async function handleBaSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!baUsername.trim() || !baPin.trim()) return;
    setBaSignInLoading(true);
    setBaSignInError("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "ba",
          campaignId: campaignSlug,
          username: baUsername.trim(),
          password: baPin.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBaSignInError(data.error || "Invalid BA username or password.");
        return;
      }

      if (data.token) {
        setShiftToken(data.token);
        localStorage.setItem(`active_shift_token_${campaignSlug}`, data.token);
      }
      const resolvedBaName = data.user?.baName || data.store?.baName || baUsername.trim() || "BA";
      const resolvedBaPhone = data.user?.baPhone || data.store?.baPhone || "";
      const resolvedStore =
        data.store ||
        stores.find(
          (s) =>
            (s.storeCode || (s as any).code || s.id || "").toLowerCase() ===
            String(data.user?.storeCode || "").toLowerCase()
        ) ||
        null;

      if (resolvedStore) setSelectedStore(resolvedStore);
      setBaName(resolvedBaName);
      setBaPhone(resolvedBaPhone);
      setBaAuthenticated(true);

      localStorage.setItem(
        `field_ops_ba_profile_${campaignSlug}`,
        JSON.stringify({
          store: resolvedStore,
          storeCode: data.user?.storeCode || resolvedStore?.storeCode || resolvedStore?.id,
          baName: resolvedBaName,
          baPhone: resolvedBaPhone,
          username: baUsername.trim(),
        })
      );

      if (data.activeShift) {
        setActiveShift(data.activeShift);
        localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(data.activeShift));
      } else {
        setActiveShift(null);
        localStorage.removeItem(`active_shift_${campaignSlug}`);
      }
    } catch {
      setBaSignInError("Network error while signing in. Please try again.");
    } finally {
      setBaSignInLoading(false);
    }
  }

  async function handleBaSignOut() {
    try {
      await fetch("/api/auth?role=ba", { method: "DELETE" });
    } catch {}
    localStorage.removeItem(`active_shift_token_${campaignSlug}`);
    localStorage.removeItem(`active_shift_${campaignSlug}`);
    localStorage.removeItem(`field_ops_ba_profile_${campaignSlug}`);
    setShiftToken("");
    setBaAuthenticated(false);
    setActiveShift(null);
    setPhotoDataUrl(null);
    setBaPin("");
  }

  // ── Step 2: Submit Check-In (With Offline Queue Fallback) ──
  async function handleCheckInSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStore || !baName.trim()) return;

    if (isGeofenceEnabled) {
      if (!coords) {
        setSubmitError("📍 Waiting for GPS location. Please allow location access or refresh GPS.");
        return;
      }
      if (!geofence?.inside) {
        setSubmitError(
          geofence?.message ||
            `🚫 You are ${formatDistance(geofence?.distance || 0)} away from ${selectedStore.name}. You must be within the ${activeRadius}m radius to check in.`
        );
        return;
      }
    }

    if (!photoDataUrl) {
      setSubmitError("📸 A live selfie snapshot is required for verification before check-in.");
      if (!isCameraOpen) startCamera();
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    const storeCodeVal = selectedStore.storeCode || (selectedStore as any).code || selectedStore.id || "";
    const checkInPayload = {
      action: "check_in",
      campaignId: campaignSlug,
      storeCode: storeCodeVal,
      baName: baName.trim(),
      baUsername: baUsername.trim(),
      baPhone: baPhone.trim(),
      pin: baPin.trim(),
      latitude: coords?.latitude ?? selectedStore.lat ?? 6.5244,
      longitude: coords?.longitude ?? selectedStore.lng ?? 3.3792,
      accuracy: coords?.accuracy,
      timestamp: coords?.timestamp || Date.now(),
      gpsSamples: gpsSamplesRef.current,
      deviceId: getOrCreateDeviceId(),
      photoUrl: photoDataUrl || undefined,
      isSimulated: demoMode !== "real",
    };

    const queueOfflineCheckIn = () => {
      const todayLagos = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const detId = `${campaignSlug.toLowerCase()}__${storeCodeVal.toLowerCase()}__${todayLagos}`;
      const optimisticShift: CheckInRecord = {
        id: detId,
        campaignId: campaignSlug,
        storeCode: storeCodeVal,
        storeName: selectedStore.name,
        baName: baName.trim(),
        baUsername: baUsername.trim() || undefined,
        baPhone: baPhone.trim(),
        shiftDate: todayLagos,
        checkInTime: new Date().toISOString(),
        checkInLat: checkInPayload.latitude,
        checkInLng: checkInPayload.longitude,
        checkInAccuracy: checkInPayload.accuracy,
        targetLat: selectedStore.lat ?? checkInPayload.latitude,
        targetLng: selectedStore.lng ?? checkInPayload.longitude,
        distanceMeters: geofence?.distance ?? 0,
        status: "verified",
        photoUrl: photoDataUrl || undefined,
        samplesLogged: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const queueItemId = `checkin_${detId}`;
      const nextQueue: OfflineQueuedSurvey[] = [
        { id: queueItemId, queuedAt: Date.now(), payload: checkInPayload },
        ...offlineQueue.filter((item) => item.id !== queueItemId),
      ];
      setOfflineQueue(nextQueue);
      localStorage.setItem(`offline_queue_${campaignSlug}`, JSON.stringify(nextQueue));
      setActiveShift(optimisticShift);
      localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(optimisticShift));
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      queueOfflineCheckIn();
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: getShiftAuthHeaders(),
        body: JSON.stringify(checkInPayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmitError(data.error || "Check-in failed. Please try again.");
        setSubmitting(false);
        return;
      }

      if (data.shiftToken) {
        setShiftToken(data.shiftToken);
        localStorage.setItem(`active_shift_token_${campaignSlug}`, data.shiftToken);
      }
      setActiveShift(data.checkIn);
      localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(data.checkIn));
    } catch {
      // Network unreachable mid-check-in: create local shift & queue for auto-sync
      queueOfflineCheckIn();
    } finally {
      setSubmitting(false);
    }
  }

  // ── Increment / Decrement Shift Counter (+1 Sample) ──
  async function handleCounterDelta(delta: number) {
    if (!activeShift) return;
    setCounterLoading(true);
    const clientRequestId = generateClientRequestId();

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: getShiftAuthHeaders(),
        body: JSON.stringify({
          action: "sample_counter",
          checkInId: activeShift.id,
          delta,
          clientRequestId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const updated = { ...activeShift, samplesLogged: data.samplesLogged };
        setActiveShift(updated);
        localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(updated));
      }
    } catch (err) {
      console.error("Counter update failed:", err);
    } finally {
      setCounterLoading(false);
    }
  }

  // ── End Shift / Check Out ──
  async function handleCheckOutSubmit() {
    if (!activeShift) return;
    if (!confirm("Are you sure you want to end your shift and check out for today?")) return;

    setSubmitting(true);
    try {
      // Flush any pending offline surveys first so no queued respondents are stranded on check-out
      if (offlineQueue.length > 0 && (typeof navigator === "undefined" || navigator.onLine)) {
        await syncOfflineQueue();
      }

      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: getShiftAuthHeaders(),
        body: JSON.stringify({
          action: "check_out",
          checkInId: activeShift.id,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          accuracy: coords?.accuracy,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.removeItem(`active_shift_${campaignSlug}`);
        localStorage.removeItem(`active_shift_token_${campaignSlug}`);
        setShiftToken("");
        setActiveShift(null);
        setSelectedStore(null);
        setPhotoDataUrl(null);
        alert(`Shift completed! Total hours: ${data.checkIn.hoursWorked || 0} hrs. Samples: ${data.checkIn.samplesLogged || 0}`);
      } else {
        alert(data.error || "Could not check out shift.");
      }
    } catch (err) {
      console.error("Checkout failed:", err);
      alert("Failed to submit check-out. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingCampaign) {
    return (
      <div className="min-h-screen bg-[#080E1A] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-white/50 tracking-wider uppercase font-mono">Loading Check-In...</p>
        </div>
      </div>
    );
  }

  const stores = campaign?.stores || [];
  const isDemoEnv = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  return (
    <div className="min-h-screen bg-[#080E1A] text-white flex flex-col justify-between selection:bg-teal-500 selection:text-black">
      {/* ── Demo Simulator Bar (Only shown when NEXT_PUBLIC_DEMO_MODE=true) ── */}
      {isDemoEnv && (
        <div className="bg-slate-900/90 border-b border-white/10 px-3 py-2 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <span className="font-bold text-white/80">Demo Simulator:</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setDemoMode("on_site"); acquireLocation("on_site"); }}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                demoMode === "on_site"
                  ? "bg-emerald-500 text-black shadow-sm"
                  : "bg-white/5 text-white/60 hover:text-white"
              }`}
            >
              📍 On-Site (25m)
            </button>
            <button
              type="button"
              onClick={() => { setDemoMode("out_of_bounds"); acquireLocation("out_of_bounds"); }}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                demoMode === "out_of_bounds"
                  ? "bg-amber-500 text-black shadow-sm"
                  : "bg-white/5 text-white/60 hover:text-white"
              }`}
            >
              🚶 600m Away
            </button>
            <button
              type="button"
              onClick={() => { setDemoMode("real"); acquireLocation("real"); }}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                demoMode === "real"
                  ? "bg-teal-500 text-black shadow-sm"
                  : "bg-white/5 text-white/60 hover:text-white"
              }`}
            >
              🛰️ Real GPS
            </button>
            <Link
              href={`/dashboard?c=${campaignSlug}`}
              className="ml-1 sm:ml-2 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 transition-all flex items-center gap-1"
            >
              📊 Ops Hub
            </Link>
          </div>
        </div>
      )}

      {/* ── Main Content Container ── */}
      <main className="max-w-md w-full mx-auto p-4 sm:p-5 flex-1 flex flex-col justify-center">

        {/* ── Header ── */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-mono font-semibold mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Field Attendance & Geofence</span>
          </div>
          <h1
            className="text-2xl font-black tracking-tight text-white"
            style={{ fontFamily: "Rubik, sans-serif" }}
          >
            {campaign?.name || "Golden Morn"}
          </h1>
          <p className="text-xs text-white/50 mt-1">
            Brand Ambassador Daily Shift Verification
          </p>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            VIEW A: SEPARATE "SURVEY" & SHIFT ARCHITECTURE (Checked In)
           ───────────────────────────────────────────────────────────── */}
        {activeShift ? (
          <div className="space-y-4 animate-fadeIn">
            {/* Offline Sync Status Bar (Akida Offline Parity) */}
            {(!isOnline || offlineQueue.length > 0) && (
              <div className="px-3.5 py-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-amber-300 font-bold">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-teal-400" : "bg-amber-400 animate-pulse"}`} />
                  <span>
                    {!isOnline
                      ? `Offline Mode · ${offlineQueue.length} queued`
                      : `${offlineQueue.length} offline survey(s) ready to sync`}
                  </span>
                </div>
                {isOnline && offlineQueue.length > 0 && (
                  <button
                    type="button"
                    disabled={syncingOffline}
                    onClick={syncOfflineQueue}
                    className="px-2.5 py-1 rounded-lg bg-amber-400 text-black font-black text-[10px] uppercase tracking-wider cursor-pointer"
                  >
                    {syncingOffline ? "Syncing..." : "Sync Now"}
                  </button>
                )}
              </div>
            )}

            {/* Compact Active Shift Status Strip */}
            <div className="px-4 py-3 rounded-2xl bg-white/[0.04] border border-teal-500/30 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${
                      activeShift.status === "flagged" ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                  />
                  <span className="text-xs font-black text-white truncate">
                    {activeShift.storeName}
                  </span>
                  {activeShift.status === "flagged" && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      FLAGGED
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/50 truncate mt-0.5">
                  {activeShift.baName} · <span className="text-teal-300 font-mono">{shiftSurveys.length} surveys</span> · <span className="font-mono">{activeShift.samplesLogged ?? 0} total</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-teal-300 bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 rounded-xl flex-shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <span>{shiftElapsed}</span>
              </div>
            </div>

            {/* 3-Tab Navigation Bar: Survey Form | Submissions | My Shift */}
            <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-slate-900/90 border border-white/10">
              <button
                type="button"
                onClick={() => setActiveTab("survey")}
                className={`py-2.5 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === "survey"
                    ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Survey</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("submissions")}
                className={`py-2.5 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === "submissions"
                    ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>Logs ({shiftSurveys.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("shift")}
                className={`py-2.5 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === "shift"
                    ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>My Shift</span>
              </button>
            </div>

            {/* ── TAB 1: DEDICATED CONSUMER / MOTHER SURVEY FORM ── */}
            {activeTab === "survey" && (
              <form
                onSubmit={handleSurveySubmit}
                className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-2xl space-y-4"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">
                      Consumer Engagement Survey
                    </h2>
                    <p className="text-[11px] text-white/50">
                      Record each shopper or mother interaction separately
                    </p>
                  </div>
                  {/* Retail vs Hospital Mode Switcher */}
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-white/10">
                    <button
                      type="button"
                      onClick={() => setSurveyMode("retail")}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        surveyMode === "retail"
                          ? "bg-teal-500 text-black"
                          : "text-white/50 hover:text-white"
                      }`}
                    >
                      <ShoppingBag className="w-3 h-3" />
                      <span>Retail</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSurveyMode("hospital")}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        surveyMode === "hospital"
                          ? "bg-teal-500 text-black"
                          : "text-white/50 hover:text-white"
                      }`}
                    >
                      <HeartPulse className="w-3 h-3" />
                      <span>Clinic</span>
                    </button>
                  </div>
                </div>

                {surveySuccessMsg && (
                  <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                    {surveySuccessMsg}
                  </div>
                )}

                {surveyErrorMsg && (
                  <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold">
                    {surveyErrorMsg}
                  </div>
                )}

                {activeQuestions ? (
                  /* ── Dynamic Superadmin-Configured / Hospital (ANC-IMC + Consent) Survey Questions ── */
                  <div className="space-y-3.5">
                    {activeQuestions.map((q) => {
                      if (!shouldShowQuestion(q)) return null;
                      const val = customAnswers[q.id] ?? "";
                      if (q.type === "select") {
                        return (
                          <div key={q.id}>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                              {q.label} {q.required && <span className="text-red-400">*</span>}
                            </label>
                            <select
                              required={q.required}
                              value={val || (q.options?.[0] ?? "")}
                              onChange={(e) =>
                                setCustomAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                              }
                              className="w-full px-3.5 py-2.5 rounded-xl text-xs text-white bg-slate-900 border border-white/15 focus:border-teal-400 focus:outline-none cursor-pointer"
                            >
                              {(q.options || []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      }

                      if (q.type === "checkbox") {
                        const selectedList = val
                          ? val
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : [];
                        return (
                          <div
                            key={q.id}
                            className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/15 space-y-2"
                          >
                            <p className="text-[11px] font-bold uppercase tracking-wider text-white/75">
                              {q.label} {q.required && <span className="text-red-400">*</span>}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {(q.options || []).map((opt) => {
                                const isChecked = selectedList.includes(opt);
                                return (
                                  <label
                                    key={opt}
                                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                                      isChecked
                                        ? "bg-teal-500/15 border-teal-400 text-teal-200"
                                        : "bg-black/30 border-white/10 text-white/70 hover:border-white/25"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        const next = isChecked
                                          ? selectedList.filter((item) => item !== opt)
                                          : [...selectedList, opt];
                                        setCustomAnswers((prev) => ({
                                          ...prev,
                                          [q.id]: next.join(", "),
                                        }));
                                      }}
                                      className="accent-teal-400"
                                    />
                                    <span>{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      if (q.type === "radio_consent") {
                        return (
                          <div
                            key={q.id}
                            className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/15 space-y-2.5"
                          >
                            <p className="text-xs text-white/85 leading-relaxed font-medium">
                              {q.label} {q.required && <span className="text-red-400">*</span>}
                            </p>
                            <div className="space-y-2">
                              {(q.options || []).map((opt) => {
                                const selected = val === opt;
                                return (
                                  <label
                                    key={opt}
                                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                                      selected
                                        ? "bg-teal-500/15 border-teal-400 text-teal-200"
                                        : "bg-black/30 border-white/10 text-white/70 hover:border-white/25"
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`consent_${q.id}`}
                                      required={q.required}
                                      checked={selected}
                                      onChange={() =>
                                        setCustomAnswers((prev) => ({ ...prev, [q.id]: opt }))
                                      }
                                      className="mt-0.5 accent-teal-400"
                                    />
                                    <span>{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={q.id}>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                            {q.label} {q.required && <span className="text-red-400">*</span>}
                            {q.maxDigits ? (
                              <span className="ml-1 text-[10px] font-mono text-white/40">
                                (Max {q.maxDigits} digits)
                              </span>
                            ) : null}
                          </label>
                          <input
                            type={q.type === "tel" ? "tel" : q.type === "number" ? "number" : "text"}
                            inputMode={q.numericOnly || q.type === "number" || q.type === "tel" ? "numeric" : undefined}
                            maxLength={q.maxDigits || undefined}
                            required={q.required}
                            placeholder={q.placeholder || ""}
                            value={val}
                            onChange={(e) => {
                              let nextVal = e.target.value;
                              if (q.numericOnly || q.type === "number") {
                                nextVal = nextVal.replace(/[^\d]/g, "");
                              }
                              if (q.maxDigits && nextVal.length > q.maxDigits) {
                                nextVal = nextVal.slice(0, q.maxDigits);
                              }
                              setCustomAnswers((prev) => ({ ...prev, [q.id]: nextVal }));
                            }}
                            className="w-full px-3.5 py-2.5 rounded-xl text-xs text-white bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                {/* Respondent Name & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                      Shopper Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Kunle Adeyemi"
                      value={respondentName}
                      onChange={(e) => setRespondentName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs text-white bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 08031234567"
                      value={respondentPhone}
                      onChange={(e) => setRespondentPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs text-white bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Retail Survey Fields */}
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                        SKU / Variant Sampled
                      </label>
                      <select
                        value={productSampled}
                        onChange={(e) => setProductSampled(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl text-xs text-white bg-slate-900 border border-white/15 focus:border-teal-400 focus:outline-none"
                      >
                        <option value="Golden Morn Maize & Soya (45g)">Golden Morn Maize & Soya (45g)</option>
                        <option value="Golden Morn Maize & Soya (300g)">Golden Morn Maize & Soya (300g)</option>
                        <option value="Golden Morn Puffs">Golden Morn Puffs</option>
                        <option value="Multi-Grain Variant">Multi-Grain Variant</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1.5">
                        Taste & Product Feedback
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { id: "loved_it", label: "😍 Loved It" },
                          { id: "good", label: "👍 Good" },
                          { id: "neutral", label: "😐 Neutral" },
                          { id: "disliked", label: "👎 Disliked" },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setTasteFeedback(opt.id as TasteFeedback)}
                            className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                              tasteFeedback === opt.id
                                ? "bg-teal-500/20 border-teal-400 text-teal-300"
                                : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-white">Purchased on Shelf?</p>
                        <p className="text-[10px] text-white/50">Did the shopper buy a pack after sampling?</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPurchasedOnShelf(!purchasedOnShelf)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                            purchasedOnShelf
                              ? "bg-emerald-500 text-black"
                              : "bg-white/10 text-white/60"
                          }`}
                        >
                          {purchasedOnShelf ? "YES · Bought" : "NO"}
                        </button>
                        {purchasedOnShelf && (
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={packsPurchased}
                            onChange={(e) => setPacksPurchased(Math.max(1, Number(e.target.value) || 1))}
                            className="w-16 px-2 py-1.5 rounded-xl text-xs font-mono text-center text-white bg-slate-900 border border-emerald-500/40"
                            title="Number of packs purchased"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  </>
                )}

                {/* Optional Notes / Comments */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                    Consumer Comment / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Any specific feedback or question..."
                    value={surveyNotes}
                    onChange={(e) => setSurveyNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs text-white bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={surveySubmitting || (!activeQuestions && !respondentName.trim())}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-teal-500/20 disabled:opacity-40 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{surveySubmitting ? "Saving Survey..." : "Submit Survey & Next Respondent"}</span>
                </button>
              </form>
            )}

            {/* ── TAB 2: SURVEY SUBMISSIONS LIST (Plus Fast Crowd Tally) ── */}
            {activeTab === "submissions" && (
              <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">
                      Shift Survey Submissions ({shiftSurveys.length})
                    </h2>
                    <p className="text-[11px] text-white/50">
                      Total samples/engagements today: <span className="text-teal-300 font-mono font-bold">{activeShift.samplesLogged ?? 0}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={counterLoading || (activeShift.samplesLogged || 0) <= 0}
                      onClick={() => handleCounterDelta(-1)}
                      className="w-8 h-8 rounded-xl bg-white/5 border border-white/15 text-white flex items-center justify-center hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                      title="Decrement sample count"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={counterLoading}
                      onClick={() => handleCounterDelta(1)}
                      className="px-2.5 h-8 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-300 font-bold text-[11px] flex items-center gap-1 hover:bg-teal-500/30 cursor-pointer"
                      title="Quick +1 cup tally without survey"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Quick +1 Cup</span>
                    </button>
                  </div>
                </div>

                {shiftSurveys.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <p className="text-xs text-white/40">No detailed surveys submitted in this shift yet.</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("survey")}
                      className="px-4 py-2 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-bold cursor-pointer"
                    >
                      + Start First Survey
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {shiftSurveys.map((s) => (
                      <div
                        key={s.id}
                        className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-start justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                            <span className="truncate">{s.respondentName}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/80 border border-white/15">
                              {s.id}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/25 uppercase">
                              {s.surveyType}
                            </span>
                          </div>
                          <div className="text-[11px] text-white/60">
                            {s.surveyType === "hospital"
                              ? s.clinicType
                                ? `${s.clinicType} · ${s.hospitalName || s.storeName} · ${s.marketingConsent ? "✅ Consented" : s.marketingConsent === false ? "❌ Opted Out" : ""}`
                                : `${s.motherStage === "expectant" ? "🤰 Expectant" : "👶 Nursing"} · ${s.diaperSizeIssued || "Kit"} · Uses ${s.currentBrandUsed || "N/A"}`
                              : `${s.productSampled || "Sample"} · ${s.tasteFeedback?.replace("_", " ") || "good"} ${s.purchasedOnShelf ? `· 🛒 Bought (${s.packsPurchased || 1})` : ""}`}
                          </div>
                          {s.notes && <p className="text-[10px] text-white/40 italic">"{s.notes}"</p>}
                        </div>
                        <span className="text-[10px] font-mono text-white/40 flex-shrink-0">
                          {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 3: MY SHIFT & CHECK-OUT DETAILS ── */}
            {activeTab === "shift" && (
              <div className="p-5 rounded-3xl bg-white/[0.03] border border-teal-500/30 backdrop-blur-xl shadow-2xl space-y-4">
                <div className="space-y-1">
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider ${
                      activeShift.status === "flagged" ? "text-amber-400" : "text-emerald-400"
                    }`}
                  >
                    {activeShift.status === "flagged"
                      ? "🟡 Flagged for Supervisor Review (Drift / Telemetry)"
                      : "🟢 Verified Within Store Geofence"}
                  </span>
                  <h2 className="text-lg font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                    {activeShift.storeName}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <User className="w-3.5 h-3.5 text-white/40" />
                    <span>{activeShift.baName}</span>
                    <span>·</span>
                    <span className="font-mono text-teal-400">{activeShift.storeCode}</span>
                  </div>
                  <div className="pt-1 flex items-center gap-2 text-[11px] font-mono text-white/50 flex-wrap">
                    <span>Checked In: {new Date(activeShift.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <span>·</span>
                    <span className="text-emerald-400">Arrival GPS: {activeShift.distanceMeters}m</span>
                  </div>
                </div>

                {/* Live Presence Heartbeat Card */}
                <div className="p-3 rounded-2xl bg-black/30 border border-white/10 flex items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <p className="font-bold text-white flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-teal-400" />
                      <span>Shift Presence Breadcrumbs</span>
                    </p>
                    <p className="text-[10px] font-mono text-white/50">
                      {activeShift.inFencePingCount || 1} in-fence pings
                      {activeShift.lastHeartbeatAt
                        ? ` · Last: ${new Date(activeShift.lastHeartbeatAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={heartbeatPinging || !coords}
                    onClick={() => sendPresenceHeartbeat(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 font-bold text-[10px] font-mono cursor-pointer disabled:opacity-40"
                  >
                    {heartbeatPinging ? "Pinging..." : "📍 Ping Presence"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 text-center">
                    <p className="text-[10px] uppercase font-bold text-white/50">Surveys Completed</p>
                    <p className="text-2xl font-black text-teal-300 font-mono mt-0.5">{shiftSurveys.length}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 text-center">
                    <p className="text-[10px] uppercase font-bold text-white/50">Total Samples</p>
                    <p className="text-2xl font-black text-white font-mono mt-0.5">{activeShift.samplesLogged ?? 0}</p>
                  </div>
                </div>

                {activeShift.photoUrl && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                        Morning GPS-Stamped Selfie Proof
                      </p>
                      {activeShift.photoSha256 && (
                        <span className="text-[9px] font-mono text-emerald-400">
                          SHA-256: {activeShift.photoSha256.slice(0, 10)}…
                        </span>
                      )}
                    </div>
                    <img
                      src={activeShift.photoUrl}
                      alt="Morning check-in proof"
                      className="w-full max-h-48 object-cover rounded-2xl border border-white/15"
                    />
                  </div>
                )}

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleCheckOutSubmit}
                  className="w-full py-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-4 h-4" />
                  <span>End Shift & Check Out</span>
                </button>
              </div>
            )}
          </div>
        ) : !baAuthenticated ? (
          /* ─────────────────────────────────────────────────────────────
             VIEW 0: BA SIGN-IN GATE (Username + Password only)
             ───────────────────────────────────────────────────────────── */
          <form onSubmit={handleBaSignIn} className="space-y-4">
            <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-2xl space-y-4">
              <div className="pb-2 border-b border-white/10">
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Step 1 · Brand Ambassador Sign In
                </h2>
                <p className="text-[11px] text-white/50 mt-0.5">
                  Sign in with your assigned username and password. Your clinic, name, and phone are loaded automatically.
                </p>
              </div>

              {baSignInError && (
                <div className="p-3 rounded-2xl text-xs font-semibold bg-red-500/15 border border-red-500/30 text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{baSignInError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1">
                  BA Username / Staff ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. chidinma or store code"
                  value={baUsername}
                  onChange={(e) => setBaUsername(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl text-xs font-mono text-amber-300 bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1">
                  Password / Access PIN <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter password or PIN"
                  value={baPin}
                  onChange={(e) => setBaPin(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl text-xs font-mono tracking-widest text-amber-300 bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={baSignInLoading || !baUsername.trim() || !baPin.trim()}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl shadow-teal-500/20 disabled:opacity-40 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{baSignInLoading ? "Signing In..." : "Sign In"}</span>
              </button>
            </div>
          </form>
        ) : (
          /* ─────────────────────────────────────────────────────────────
             VIEW B: GEOFENCE & LIVE SELFIE CHECK-IN (Signed In, Not Yet Checked In)
             ───────────────────────────────────────────────────────────── */
          <form onSubmit={handleCheckInSubmit} className="space-y-4">
            <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-2xl space-y-4">

              {/* Signed-In BA & Venue Banner */}
              <div className="p-3 rounded-2xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-teal-300">
                    Step 2 · Signed In as {baName}
                  </p>
                  <p className="text-xs font-black text-white truncate">
                    {selectedStore?.name || "Selected Venue"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleBaSignOut}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white/80 hover:text-white flex items-center gap-1 cursor-pointer flex-shrink-0"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Sign Out</span>
                </button>
              </div>

              {/* Error Banner */}
              {submitError && (
                <div className="p-3 rounded-2xl text-xs font-semibold bg-red-500/15 border border-red-500/30 text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* 3. Live Geofence Status Card (Only shown when geofenceEnabled !== false) */}
              {selectedStore && isGeofenceEnabled ? (
                <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/60 flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-teal-400" />
                      Geofence Status
                    </span>
                    <button
                      type="button"
                      disabled={gpsLoading}
                      onClick={() => acquireLocation(demoMode, selectedStore)}
                      className="text-[10px] text-teal-300 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${gpsLoading ? "animate-spin" : ""}`} />
                      <span>Refresh GPS</span>
                    </button>
                  </div>

                  {gpsLoading ? (
                    <div className="py-2 text-center text-xs text-white/50 flex items-center justify-center gap-2">
                      <span className="w-3 h-3 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                      <span>Acquiring satellite lock...</span>
                    </div>
                  ) : gpsError ? (
                    <p className="text-xs text-red-400">{gpsError}</p>
                  ) : geofence ? (
                    <div className="space-y-1.5">
                      {typeof selectedStore.lat === "number" && typeof selectedStore.lng === "number" && (
                        <GeofenceMap
                          className="h-48 mb-2"
                          targetLat={selectedStore.lat}
                          targetLng={selectedStore.lng}
                          radius={activeRadius}
                          polygon={selectedStore.polygon}
                          targetLabel={selectedStore.name}
                          userLat={coords?.latitude}
                          userLng={coords?.longitude}
                          accuracy={coords?.accuracy}
                          status={geofence.status}
                        />
                      )}
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-white/60">Distance to Store:</span>
                        <span className="font-bold text-white">{formatDistance(geofence.distance)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-white/60">Accuracy Tolerance:</span>
                        <span className="text-white/70">±{coords?.accuracy || 10}m</span>
                      </div>

                      {/* Evaluation Badge */}
                      <div className="pt-1">
                        {geofence.status === "verified" ? (
                          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                            <span>🟢 On-Site Verified ({formatDistance(geofence.distance)} away)</span>
                          </div>
                        ) : geofence.status === "drift" ? (
                          <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                            <span>🟡 Indoor Mall Drift Accepted ({formatDistance(geofence.distance)})</span>
                          </div>
                        ) : (
                          <div className="p-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
                            <span>🔴 Outside {activeRadius}m Geofence ({formatDistance(geofence.distance)} away)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : selectedStore ? (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Direct Check-In Mode · Geofence requirement is disabled for this event</span>
                </div>
              ) : null}

              {/* 4. Morning In-App Live Selfie (Strictly Live Camera Snap, No Uploads) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/60">
                    Live Selfie Verification <span className="text-red-400">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                    Live Camera Only · No Upload
                  </span>
                </div>

                {/* State 1: Photo already snapped */}
                {watermarking ? (
                  <div className="rounded-2xl border border-teal-500/40 bg-black/60 p-6 flex flex-col items-center justify-center gap-2">
                    <span className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-white/70">Stamping GPS Map Camera watermark…</p>
                  </div>
                ) : photoDataUrl ? (
                  <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-3 space-y-3">
                    <div className="relative">
                      <img
                        id="ba-selfie-preview"
                        src={photoDataUrl}
                        alt="BA selfie with GPS Map Camera watermark"
                        className="w-full rounded-xl border-2 border-emerald-400/70 shadow-md"
                      />
                      <div className="absolute top-2 left-2 bg-emerald-500 text-black px-2 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>GPS STAMPED</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Live Selfie Captured · Location watermark burned in</span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoDataUrl(null);
                          startCamera();
                        }}
                        className="flex-1 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retake Selfie</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhotoDataUrl(null)}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-red-500/15 hover:bg-red-500/25 text-red-300 flex items-center justify-center transition-all cursor-pointer"
                        title="Remove photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : isCameraOpen ? (
                  /* State 2: Active In-App Camera Viewfinder */
                  <div className="rounded-2xl border border-teal-500/40 bg-black/60 p-3 space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between text-xs pb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                        <span className="font-bold text-white tracking-wide">Live Camera Viewfinder</span>
                      </div>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="text-white/50 hover:text-white p-1 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Camera Video Viewfinder with Face Alignment Overlay */}
                    <div className="relative aspect-[4/3] w-full max-w-sm mx-auto overflow-hidden rounded-2xl bg-black border border-white/20 flex items-center justify-center shadow-inner">
                      {cameraStarting && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 gap-2">
                          <span className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                          <p className="text-xs text-white/70">Connecting device camera...</p>
                        </div>
                      )}

                      <video
                        ref={(node) => {
                          (videoRef as any).current = node;
                          if (node && mediaStreamRef.current && node.srcObject !== mediaStreamRef.current) {
                            node.srcObject = mediaStreamRef.current;
                            node.play().catch(() => {});
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        style={{ transform: "scaleX(-1)" }}
                      />

                      {/* Face Alignment Frame */}
                      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center">
                        <div className="w-36 h-44 sm:w-44 sm:h-52 border-2 border-dashed border-teal-400/70 rounded-[50%] shadow-[0_0_20px_rgba(45,212,191,0.25)] flex items-center justify-center">
                          <span className="text-[10px] uppercase font-mono text-teal-300/80 bg-black/40 px-2 py-0.5 rounded-full">
                            Center Face Here
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Camera Error (if any) */}
                    {cameraError && (
                      <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs space-y-1">
                        <p className="font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Camera Access Issue
                        </p>
                        <p className="text-[11px] text-red-200/80">{cameraError}</p>
                        <button
                          type="button"
                          onClick={startCamera}
                          className="mt-1 text-[11px] underline text-teal-300"
                        >
                          Retry Permission
                        </button>
                      </div>
                    )}

                    {/* Snap & Cancel Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white/70 hover:text-white transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        id="snap-selfie-btn"
                        onClick={snapSelfie}
                        disabled={cameraStarting || watermarking}
                        className="flex-1 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-black flex items-center justify-center gap-2 shadow-lg shadow-teal-500/25 active:scale-95 transition-all cursor-pointer"
                      >
                        <Camera className="w-4 h-4 stroke-[2.5]" />
                        <span>📸 Snap Selfie Now</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* State 3: Camera Not Started (Prompt to Snap) */
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="w-full py-4 px-4 rounded-2xl border-2 border-dashed border-teal-500/30 hover:border-teal-400 bg-teal-500/[0.04] hover:bg-teal-500/[0.08] text-white flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer group shadow-sm"
                    >
                      <div className="w-10 h-10 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 group-hover:scale-110 transition-transform">
                        <Camera className="w-5 h-5" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-black text-white group-hover:text-teal-300 transition-colors">
                          📸 Open Camera to Snap Arrival Selfie
                        </p>
                        <p className="text-[11px] text-white/50 mt-0.5">
                          Tap to activate laptop webcam or mobile front camera
                        </p>
                      </div>
                    </button>

                    {cameraError && (
                      <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
                        <p className="font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Camera Access Issue
                        </p>
                        <p className="text-[11px] text-red-200/80 mt-0.5">{cameraError}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Submit Check-In Button */}
              <button
                type="submit"
                id="checkin-submit-btn"
                disabled={
                  submitting ||
                  watermarking ||
                  !selectedStore ||
                  !baName.trim() ||
                  (isGeofenceEnabled && (!coords || !geofence?.inside))
                }
                className="w-full py-3.5 rounded-2xl bg-teal-500 hover:bg-teal-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl shadow-teal-500/20 disabled:opacity-40 cursor-pointer active:scale-[0.99]"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Attendance...</span>
                  </>
                ) : isGeofenceEnabled && geofence && !geofence.inside ? (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span>Outside {activeRadius}m Geofence — Move Closer</span>
                  </>
                ) : !photoDataUrl ? (
                  <>
                    <Camera className="w-4 h-4 stroke-[2.5]" />
                    <span>Snap Selfie & Check In</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Check In & Start Shift</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-4 text-[10px] text-white/30 font-mono flex items-center justify-center gap-2 flex-wrap">
        <span>Field Operations Verification Engine · Active Campaign: {campaignSlug}</span>
        <span>·</span>
        <Link href={`/dashboard?c=${campaignSlug}`} className="text-teal-400/70 hover:text-teal-300 underline">
          Supervisor Ops Hub
        </Link>
        <span>·</span>
        <Link href="/superadmin" className="text-amber-400/70 hover:text-amber-300 underline">
          Superadmin Console
        </Link>
      </footer>
    </div>
  );
}

export default function CheckInPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#080E1A] text-white flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-white/50 tracking-wider uppercase font-mono">Loading Check-In...</p>
          </div>
        </div>
      }
    >
      <CheckInContent />
    </React.Suspense>
  );
}
