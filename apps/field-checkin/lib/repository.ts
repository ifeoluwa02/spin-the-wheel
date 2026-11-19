import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  runTransaction,
  query,
  where,
  orderBy,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { calculateDistanceMeters, evaluateGeofence, isValidCoordinates } from "./geo";
import type {
  CheckInRecord,
  CheckOutSubmitPayload,
  Campaign,
  StoreLocation,
  SurveyRecord,
  GpsBreadcrumb,
} from "./types";

const COLLECTION_NAME = "checkins";
const SURVEYS_COLLECTION = "surveys";
const SUPERADMIN_CONFIG_DOC_ID = "_admin_config_";

export interface SuperAdminConfig {
  username: string;
  passwordHash: string;
  setupCompleted: boolean;
  updatedAt: number;
}

let cachedSuperAdminConfig: SuperAdminConfig | null = null;

function withTimeout<T>(promise: Promise<T>, ms = 4000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Firestore request timed out")), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function getSuperAdminConfig(): Promise<SuperAdminConfig | null> {
  try {
    const snap = await withTimeout(getDoc(doc(db, "campaigns", SUPERADMIN_CONFIG_DOC_ID)), 4000);
    if (snap.exists()) {
      const data = snap.data();
      if (data.adminUsername && data.adminPassword) {
        const cfg: SuperAdminConfig = {
          username: String(data.adminUsername).trim().toLowerCase(),
          passwordHash: String(data.adminPassword),
          setupCompleted: true,
          updatedAt: Number(data.updatedAt) || Date.now(),
        };
        cachedSuperAdminConfig = cfg;
        return cfg;
      }
    }
  } catch (err) {
    console.warn("Could not read Superadmin config from Firestore:", err);
  }
  return cachedSuperAdminConfig;
}

export async function saveSuperAdminConfig(params: {
  username: string;
  passwordHash: string;
}): Promise<SuperAdminConfig> {
  const now = Date.now();
  const cleanUser = params.username.trim().toLowerCase();
  const cfg: SuperAdminConfig = {
    username: cleanUser,
    passwordHash: params.passwordHash,
    setupCompleted: true,
    updatedAt: now,
  };
  cachedSuperAdminConfig = cfg;

  try {
    await withTimeout(
      setDoc(
        doc(db, "campaigns", SUPERADMIN_CONFIG_DOC_ID),
        {
          id: SUPERADMIN_CONFIG_DOC_ID,
          name: "System Superadmin Configuration",
          adminUsername: cleanUser,
          adminPassword: params.passwordHash,
          active: false,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      ),
      5000
    );
  } catch (err) {
    console.warn("Firestore write timed out or blocked by rules, using cached Superadmin config:", err);
  }

  return cfg;
}

function normalizeSlugKey(val: string): string {
  return String(val || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
}

export function buildDeterministicCheckInId(
  campaignId: string,
  storeCode: string,
  shiftDate: string
): string {
  return `${normalizeSlugKey(campaignId)}__${normalizeSlugKey(storeCode)}__${normalizeSlugKey(shiftDate)}`;
}

const campaignCache = new Map<string, Campaign>();
const dirtyCampaigns = new Set<string>();

async function flushDirtyCampaigns(): Promise<void> {
  if (dirtyCampaigns.size === 0) return;
  for (const slug of Array.from(dirtyCampaigns)) {
    const cached = campaignCache.get(slug);
    if (!cached) {
      dirtyCampaigns.delete(slug);
      continue;
    }
    try {
      await withTimeout(setDoc(doc(db, "campaigns", slug), cached, { merge: true }), 3500);
      dirtyCampaigns.delete(slug);
    } catch {
      // Still offline; keep in dirtyCampaigns for next reconnect
      return;
    }
  }
}

/**
 * Retrieves campaign metadata and stores list from Firestore (with offline cache fallback & auto-flush).
 * Only falls back to demo Golden Morn campaign when slug === "golden-morn".
 */
export async function getCampaign(slug: string): Promise<Campaign | null> {
  const cleanSlug = normalizeSlugKey(slug || "golden-morn");
  if (cleanSlug === SUPERADMIN_CONFIG_DOC_ID) return null;
  const localCached = campaignCache.get(cleanSlug);

  try {
    await flushDirtyCampaigns();
    const snap = await withTimeout(getDoc(doc(db, "campaigns", cleanSlug)), 4000);
    if (snap.exists()) {
      const remote = { id: snap.id, ...snap.data() } as Campaign;
      // Prefer localCached if it has unsynced newer edits
      if (localCached && (localCached.updatedAt || 0) > (remote.updatedAt || 0)) {
        return localCached;
      }
      campaignCache.set(cleanSlug, remote);
      return remote;
    }
  } catch (err) {
    console.warn("Could not fetch campaign from Firestore:", err);
  }

  if (localCached) {
    return localCached;
  }

  if (cleanSlug === "golden-morn") {
    return {
      id: "golden-morn",
      name: "Nestlé Golden Morn Activation",
      brandName: "Golden Morn",
      activationType: "retail",
      adminUsername: "goldenmorn",
      adminPin: "2026",
      stores: DEFAULT_DEMO_STORES,
      primaryColor: "#00BFA6",
      secondaryColor: "#FF6B35",
      active: true,
    };
  }

  return null;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in West Africa Time (Africa/Lagos, UTC+1).
 * Uses Intl.DateTimeFormat to avoid local timezone offset bugs.
 */
export function getTodayDateStr(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    const utc = date.getTime();
    const wat = new Date(utc + 3600000);
    return wat.toISOString().split("T")[0];
  }
}

function stripUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(stripUndefined);
  }
  if (obj && typeof obj === "object") {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        clean[k] = stripUndefined(v);
      }
    }
    return clean;
  }
  return obj;
}

/**
 * Creates and records a new on-site check-in in Firestore using a deterministic document ID
 * and a transaction to prevent race-condition duplicate shifts.
 */
export async function recordCheckIn(
  data: Omit<CheckInRecord, "id" | "createdAt" | "updatedAt">
): Promise<{ checkIn: CheckInRecord; alreadyExisted: boolean }> {
  const now = Date.now();
  const initialBreadcrumb: GpsBreadcrumb = {
    timestamp: now,
    lat: data.checkInLat,
    lng: data.checkInLng,
    accuracy: data.checkInAccuracy,
    distanceMeters: data.distanceMeters,
    inside: true,
  };

  const raw = stripUndefined({
    ...data,
    breadcrumbs: data.breadcrumbs || [initialBreadcrumb],
    lastHeartbeatAt: now,
    lastLat: data.checkInLat,
    lastLng: data.checkInLng,
    lastDistanceMeters: data.distanceMeters,
    inFencePingCount: 1,
    outOfFencePingCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  const detId = buildDeterministicCheckInId(data.campaignId, data.storeCode, data.shiftDate);
  const docRef = doc(db, COLLECTION_NAME, detId);

  try {
    const result = await runTransaction(db, async (tx) => {
      const existingSnap = await tx.get(docRef);
      if (existingSnap.exists()) {
        const existingData = existingSnap.data() as CheckInRecord;
        if (existingData.status !== "checked_out" && existingData.status !== "rejected") {
          return {
            checkIn: { ...existingData, id: existingSnap.id },
            alreadyExisted: true,
          };
        }
      }
      tx.set(docRef, raw);
      return {
        checkIn: { ...(raw as CheckInRecord), id: detId },
        alreadyExisted: false,
      };
    });
    return result;
  } catch {
    // Fallback if transaction fails (e.g. legacy doc id)
    await setDoc(docRef, raw);
    return {
      checkIn: { ...(raw as CheckInRecord), id: detId },
      alreadyExisted: false,
    };
  }
}

/**
 * Records departure / check-out for an active shift, including check-out geofence verification.
 */
export async function recordCheckOut(
  payload: CheckOutSubmitPayload,
  allowedRadius = 200
): Promise<CheckInRecord> {
  const docRef = doc(db, COLLECTION_NAME, payload.checkInId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error("Check-in record not found.");
  }

  const existing = snap.data() as CheckInRecord;
  if (existing.status === "checked_out") {
    return { ...existing, id: snap.id };
  }

  const nowIso = new Date().toISOString();
  const nowTs = Date.now();

  // Compute total hours worked
  let hoursWorked = 0;
  if (existing.checkInTime) {
    const diffMs = nowTs - new Date(existing.checkInTime).getTime();
    hoursWorked = Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10);
  }

  const updates: Record<string, any> = {
    checkOutTime: nowIso,
    status: "checked_out",
    hoursWorked,
    updatedAt: nowTs,
  };

  if (isValidCoordinates(payload.latitude, payload.longitude)) {
    updates.checkOutLat = payload.latitude;
    updates.checkOutLng = payload.longitude;
    if (typeof payload.accuracy === "number") {
      updates.checkOutAccuracy = payload.accuracy;
    }
    if (isValidCoordinates(existing.targetLat, existing.targetLng)) {
      const evalOut = evaluateGeofence(
        {
          latitude: payload.latitude!,
          longitude: payload.longitude!,
          accuracy: payload.accuracy,
        },
        { latitude: existing.targetLat, longitude: existing.targetLng },
        allowedRadius
      );
      updates.checkOutDistanceMeters = evalOut.distance >= 0 ? evalOut.distance : undefined;
      updates.checkOutInsideFence = evalOut.inside;
    }
  }

  if (payload.notes !== undefined) {
    updates.notes = String(payload.notes).trim().slice(0, 2000);
  }

  const cleanUpdates = stripUndefined(updates);
  await updateDoc(docRef, cleanUpdates);

  return {
    ...existing,
    ...cleanUpdates,
    id: snap.id,
  };
}

/**
 * Records a live GPS heartbeat during an active shift (Akida-style continuous presence).
 */
export async function recordShiftHeartbeat(params: {
  checkInId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  allowedRadius?: number;
}): Promise<{
  checkIn: CheckInRecord;
  inside: boolean;
  distanceMeters: number;
}> {
  const docRef = doc(db, COLLECTION_NAME, params.checkInId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error("Active shift record not found.");
  }

  const existing = snap.data() as CheckInRecord;
  if (existing.status === "checked_out") {
    throw new Error("Shift is already checked out.");
  }

  const evalPing = evaluateGeofence(
    {
      latitude: params.latitude,
      longitude: params.longitude,
      accuracy: params.accuracy,
    },
    { latitude: existing.targetLat, longitude: existing.targetLng },
    params.allowedRadius || 200
  );

  const now = Date.now();
  const dist = evalPing.distance >= 0 ? evalPing.distance : 0;
  const crumb: GpsBreadcrumb = stripUndefined({
    timestamp: now,
    lat: params.latitude,
    lng: params.longitude,
    accuracy: params.accuracy,
    distanceMeters: dist,
    inside: evalPing.inside,
  });

  const prevCrumbs = Array.isArray(existing.breadcrumbs) ? existing.breadcrumbs : [];
  const nextCrumbs = [...prevCrumbs.slice(-49), crumb];
  const inCount = (existing.inFencePingCount || 0) + (evalPing.inside ? 1 : 0);
  const outCount = (existing.outOfFencePingCount || 0) + (evalPing.inside ? 0 : 1);

  // If BA has accumulated 2+ out-of-fence pings while active, auto-flag shift for supervisor review
  const nextStatus =
    !evalPing.inside && outCount >= 2 && existing.status === "verified"
      ? "flagged"
      : existing.status;

  const updates = stripUndefined({
    breadcrumbs: nextCrumbs,
    lastHeartbeatAt: now,
    lastLat: params.latitude,
    lastLng: params.longitude,
    lastDistanceMeters: dist,
    inFencePingCount: inCount,
    outOfFencePingCount: outCount,
    status: nextStatus,
    updatedAt: now,
  });

  await updateDoc(docRef, updates);

  return {
    checkIn: { ...existing, ...updates, id: snap.id },
    inside: evalPing.inside,
    distanceMeters: dist,
  };
}

/**
 * Supervisor review action: approves or rejects a flagged check-in record.
 */
export async function reviewCheckInRecord(params: {
  checkInId: string;
  decision: "approved" | "rejected";
  reviewedBy: string;
  reviewNote?: string;
}): Promise<CheckInRecord> {
  const docRef = doc(db, COLLECTION_NAME, params.checkInId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error("Check-in record not found.");
  }

  const existing = snap.data() as CheckInRecord;
  const now = Date.now();
  const nextStatus =
    existing.status === "checked_out"
      ? "checked_out"
      : params.decision === "approved"
      ? "verified"
      : "rejected";

  const updates = stripUndefined({
    status: nextStatus,
    reviewStatus: params.decision,
    reviewedBy: params.reviewedBy.slice(0, 120),
    reviewedAt: now,
    reviewNote: params.reviewNote ? params.reviewNote.trim().slice(0, 1000) : undefined,
    updatedAt: now,
  });

  await updateDoc(docRef, updates);
  return { ...existing, ...updates, id: snap.id };
}

/**
 * Retrieves today's check-in record for a specific store if one exists.
 * Prioritizes active shifts over checked-out shifts.
 */
export async function getStoreTodayCheckIn(
  campaignId: string,
  storeCode: string,
  dateStr?: string
): Promise<CheckInRecord | null> {
  const targetDate = dateStr || getTodayDateStr();
  const cleanCode = storeCode.trim().toLowerCase();

  try {
    // 1. Check deterministic ID first
    const detId = buildDeterministicCheckInId(campaignId, cleanCode, targetDate);
    const detSnap = await getDoc(doc(db, COLLECTION_NAME, detId));
    if (detSnap.exists()) {
      return { ...(detSnap.data() as CheckInRecord), id: detSnap.id };
    }

    // 2. Fallback query for legacy auto-ID records
    const q = query(
      collection(db, COLLECTION_NAME),
      where("campaignId", "==", campaignId),
      where("shiftDate", "==", targetDate)
    );

    const snap = await getDocs(q);
    let fallbackMatch: CheckInRecord | null = null;
    for (const d of snap.docs) {
      const data = d.data() as CheckInRecord;
      if (data.storeCode && data.storeCode.trim().toLowerCase() === cleanCode) {
        const rec = { ...data, id: d.id };
        if (rec.status !== "checked_out" && rec.status !== "rejected") {
          return rec;
        }
        fallbackMatch = rec;
      }
    }
    return fallbackMatch;
  } catch (err) {
    console.warn("Could not query store today check-in:", err);
  }

  return null;
}

export async function getCheckInById(checkInId: string): Promise<CheckInRecord | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION_NAME, checkInId));
    if (snap.exists()) {
      return { ...(snap.data() as CheckInRecord), id: snap.id };
    }
  } catch (err) {
    console.warn("Could not fetch check-in by id:", err);
  }
  return null;
}

/**
 * Retrieves all check-in records for a campaign on a given date (for supervisor dashboard).
 */
export async function getDailyCheckIns(
  campaignId: string,
  dateStr?: string
): Promise<CheckInRecord[]> {
  const targetDate = dateStr || getTodayDateStr();

  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("campaignId", "==", campaignId),
      where("shiftDate", "==", targetDate),
      orderBy("checkInTime", "desc")
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      ...(d.data() as CheckInRecord),
      id: d.id,
    }));
  } catch {
    try {
      const qFallback = query(
        collection(db, COLLECTION_NAME),
        where("campaignId", "==", campaignId),
        where("shiftDate", "==", targetDate)
      );
      const snap = await getDocs(qFallback);
      const records = snap.docs.map((d) => ({
        ...(d.data() as CheckInRecord),
        id: d.id,
      }));
      return records.sort((a, b) => (b.checkInTime || "").localeCompare(a.checkInTime || ""));
    } catch (err2) {
      console.error("Failed to fetch daily checkins:", err2);
      return [];
    }
  }
}

/**
 * Atomically increments or decrements the shift sample/engagement counter (+1/-1 sample).
 */
export async function updateShiftSampleCounter(
  checkInId: string,
  delta: number
): Promise<number> {
  const safeDelta = delta < 0 ? -1 : 1;
  const docRef = doc(db, COLLECTION_NAME, checkInId);

  try {
    return await runTransaction(db, async (tx) => {
      const currentSnap = await tx.get(docRef);
      if (!currentSnap.exists()) {
        throw new Error("Check-in record not found.");
      }
      const currentCount = (currentSnap.data()?.samplesLogged as number) || 0;
      if (safeDelta < 0 && currentCount <= 0) {
        return 0;
      }
      const nextCount = Math.max(0, currentCount + safeDelta);
      tx.update(docRef, {
        samplesLogged: increment(safeDelta),
        updatedAt: Date.now(),
      });
      return nextCount;
    });
  } catch (err) {
    const currentSnap = await getDoc(docRef);
    if (!currentSnap.exists()) {
      throw new Error("Check-in record not found.");
    }
    const currentCount = (currentSnap.data()?.samplesLogged as number) || 0;
    if (safeDelta < 0 && currentCount <= 0) return 0;
    await updateDoc(docRef, {
      samplesLogged: increment(safeDelta),
      updatedAt: Date.now(),
    });
    return Math.max(0, currentCount + safeDelta);
  }
}

/**
 * Records a consumer / mother survey response in Firestore "surveys" collection
 * and increments the linked shift's samplesLogged counter by +1.
 */
export async function recordSurvey(
  data: Omit<SurveyRecord, "id" | "createdAt">
): Promise<{ survey: SurveyRecord; samplesLogged: number }> {
  const now = Date.now();
  const surveyId = `srv_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const cleanData = stripUndefined({
    ...data,
    id: surveyId,
    createdAt: now,
  }) as SurveyRecord;

  const docRef = await addDoc(collection(db, SURVEYS_COLLECTION), cleanData);
  cleanData.id = docRef.id;

  let samplesLogged = 0;
  if (data.checkInId) {
    try {
      samplesLogged = await updateShiftSampleCounter(data.checkInId, 1);
    } catch (err) {
      console.warn("Could not increment shift counter after survey:", err);
    }
  }

  return {
    survey: cleanData,
    samplesLogged,
  };
}

/**
 * Retrieves survey submissions for a campaign on a given date (and optionally filtered by checkInId).
 */
export async function getDailySurveys(
  campaignId: string,
  dateStr?: string,
  checkInId?: string
): Promise<SurveyRecord[]> {
  const targetDate = dateStr || getTodayDateStr();

  try {
    const q = query(
      collection(db, SURVEYS_COLLECTION),
      where("campaignId", "==", campaignId),
      where("shiftDate", "==", targetDate)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({
      ...(d.data() as SurveyRecord),
      id: d.id,
    }));
    const filtered = checkInId ? list.filter((s) => s.checkInId === checkInId) : list;
    if (filtered.length > 0) {
      return filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
  } catch {
    // Fallback below: read embedded surveys from checkins collection
  }

  try {
    if (checkInId) {
      const checkInSnap = await getDoc(doc(db, COLLECTION_NAME, checkInId));
      if (checkInSnap.exists() && Array.isArray(checkInSnap.data()?.surveys)) {
        return (checkInSnap.data().surveys as SurveyRecord[]).sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
        );
      }
      return [];
    }

    const dailyCheckIns = await getDailyCheckIns(campaignId, targetDate);
    const allEmbedded: SurveyRecord[] = [];
    for (const rec of dailyCheckIns) {
      const arr = (rec as any).surveys;
      if (Array.isArray(arr)) {
        allEmbedded.push(...arr);
      }
    }
    return allEmbedded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [];
  }
}

export async function getAllCampaigns(): Promise<Campaign[]> {
  try {
    await flushDirtyCampaigns();
    const snap = await withTimeout(getDocs(collection(db, "campaigns")), 4500);
    const mergedMap = new Map<string, Campaign>();

    for (const d of snap.docs) {
      if (d.id === SUPERADMIN_CONFIG_DOC_ID) continue;
      const remote = { id: d.id, ...(d.data() as Campaign) };
      mergedMap.set(d.id, remote);
      const existingLocal = campaignCache.get(d.id);
      if (!existingLocal || (remote.updatedAt || 0) >= (existingLocal.updatedAt || 0)) {
        campaignCache.set(d.id, remote);
      }
    }

    // Merge any locally cached campaigns (e.g. created while offline)
    for (const [slug, localCamp] of campaignCache.entries()) {
      const rem = mergedMap.get(slug);
      if (!rem || (localCamp.updatedAt || 0) > (rem.updatedAt || 0)) {
        mergedMap.set(slug, localCamp);
      }
    }

    const list = Array.from(mergedMap.values());
    if (list.length > 0) {
      return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
  } catch (err) {
    console.warn("Could not list campaigns from Firestore, using memory cache:", err);
    if (campaignCache.size > 0) {
      return Array.from(campaignCache.values()).sort(
        (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
      );
    }
  }
  return [
    {
      id: "golden-morn",
      name: "Nestlé Golden Morn Activation",
      brandName: "Golden Morn",
      activationType: "retail",
      adminUsername: "goldenmorn",
      adminPin: "2026",
      stores: DEFAULT_DEMO_STORES,
      primaryColor: "#00BFA6",
      secondaryColor: "#FF6B35",
      active: true,
    },
  ];
}

export async function saveCampaign(campaign: Campaign): Promise<Campaign> {
  const slug = (campaign.id || "golden-morn").trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
  const docRef = doc(db, "campaigns", slug);
  const now = Date.now();
  const payload = stripUndefined({
    ...campaign,
    id: slug,
    updatedAt: now,
    createdAt: campaign.createdAt || now,
  }) as Campaign;

  campaignCache.set(slug, payload);
  dirtyCampaigns.add(slug);

  try {
    await withTimeout(setDoc(docRef, payload, { merge: true }), 4500);
    dirtyCampaigns.delete(slug);
  } catch (err) {
    console.warn(
      `Firestore unreachable while saving campaign "${slug}" — cached in memory and queued for auto-sync on reconnect:`,
      err
    );
  }
  return payload;
}

/**
 * Ground-truthing: updates the lat/lng coordinates for a store in a campaign using a transaction.
 */
export async function updateStoreCoordinates(
  campaignId: string,
  storeCode: string,
  lat: number,
  lng: number
): Promise<boolean> {
  if (!isValidCoordinates(lat, lng)) return false;
  try {
    const docRef = doc(db, "campaigns", campaignId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) throw new Error("Campaign not found");
      const campaign = snap.data() as Campaign;
      const stores = (campaign.stores || []).map((s) => {
        const code = s.storeCode || (s as any).code || s.id;
        if (code === storeCode) {
          return { ...s, lat, lng };
        }
        return s;
      });
      tx.update(docRef, { stores, updatedAt: Date.now() });
    });
    return true;
  } catch (err) {
    console.error("Failed to update store coordinates:", err);
    return false;
  }
}

/**
 * Pre-configured realistic Nigerian stores with GPS geofence coordinates.
 */
export const DEFAULT_DEMO_STORES: StoreLocation[] = [
  {
    id: "magboro-island-estate",
    name: "Field Ops Hub - Island Estate",
    storeCode: "magboro-island-estate",
    state: "Ogun",
    address: "10 Balegi Avenue, Island Estate, Magboro, Ogun State",
    pin: "1234",
    baName: "Ifeoluwa Olawoore",
    baPhone: "08030001234",
    isActive: true,
    lat: 6.7148,
    lng: 3.4025,
    geofenceRadius: 200,
  },
  {
    id: "exp-marketing-ikeja",
    name: "EXP Marketing HQ",
    storeCode: "exp-marketing-ikeja",
    state: "Lagos",
    address: "10 Adekunle Fajuyi Way, GRA Ikeja, Lagos",
    pin: "1234",
    baName: "Ifeoluwa Olawoore",
    baPhone: "08030001234",
    isActive: true,
    lat: 6.5702,
    lng: 3.3496,
    geofenceRadius: 200,
  },
  {
    id: "spar-ilupeju",
    name: "Spar Supermarket Ilupeju",
    storeCode: "spar-ilupeju",
    state: "Lagos",
    address: "31/33 Town Planning Way, Ilupeju, Lagos",
    pin: "1234",
    baName: "Chidinma Okafor",
    baPhone: "08031234567",
    isActive: true,
    lat: 6.5492,
    lng: 3.3644,
    geofenceRadius: 100,
  },
  {
    id: "justrite-bariga",
    name: "Justrite Superstore Bariga",
    storeCode: "justrite-bariga",
    state: "Lagos",
    address: "24 Jagunmolu Street, Bariga, Lagos",
    pin: "2345",
    baName: "Tunde Adebayo",
    baPhone: "08029876543",
    isActive: true,
    lat: 6.5385,
    lng: 3.3892,
    geofenceRadius: 100,
  },
  {
    id: "hubmart-vi",
    name: "Hubmart Stores Victoria Island",
    storeCode: "hubmart-vi",
    state: "Lagos",
    address: "35 Adeola Odeku St, Victoria Island, Lagos",
    pin: "3456",
    baName: "Amina Bello",
    baPhone: "08181122334",
    isActive: true,
    lat: 6.4312,
    lng: 3.4248,
    geofenceRadius: 80,
  },
  {
    id: "health-trust-wuse",
    name: "Health Trust Pharmacy Wuse 2",
    storeCode: "health-trust-wuse",
    state: "FCT - Abuja",
    address: "Aminu Kano Crescent, Wuse 2, Abuja",
    pin: "4567",
    baName: "Ibrahim Sani",
    baPhone: "08095566778",
    isActive: true,
    lat: 9.0765,
    lng: 7.4812,
    geofenceRadius: 100,
  },
];

/**
 * Seeds the campaign with realistic pre-configured geotagged stores.
 */
export async function seedDemoStores(campaignId = "golden-morn"): Promise<StoreLocation[]> {
  const docRef = doc(db, "campaigns", campaignId);
  const snap = await getDoc(docRef);

  const existingData = snap.exists() ? (snap.data() as Campaign) : null;
  const campaignData: Campaign = {
    id: campaignId,
    name: existingData?.name || "Nestlé Golden Morn Activation",
    brandName: existingData?.brandName || "Golden Morn",
    stores: DEFAULT_DEMO_STORES,
    primaryColor: existingData?.primaryColor || "#00BFA6",
    secondaryColor: existingData?.secondaryColor || "#FF6B35",
    active: true,
  };

  await setDoc(docRef, campaignData, { merge: true });
  return DEFAULT_DEMO_STORES;
}
