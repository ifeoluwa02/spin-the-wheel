import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CheckInRecord, CheckOutSubmitPayload, Campaign, StoreLocation } from "./types";

const COLLECTION_NAME = "checkins";

/**
 * Retrieves campaign metadata and stores list from Firestore.
 */
export async function getCampaign(slug: string): Promise<Campaign | null> {
  try {
    const snap = await getDoc(doc(db, "campaigns", slug));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Campaign;
    }
  } catch (err) {
    console.warn("Could not fetch campaign:", err);
  }
  return null;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in West Africa Time (UTC+1).
 */
export function getTodayDateStr(): string {
  const d = new Date();
  // Adjust to WAT (UTC+1)
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const wat = new Date(utc + 3600000);
  return wat.toISOString().split("T")[0];
}

/**
 * Creates and records a new on-site check-in in Firestore.
 */
export async function recordCheckIn(
  data: Omit<CheckInRecord, "id" | "createdAt" | "updatedAt">
): Promise<CheckInRecord> {
  const now = Date.now();
  const raw = {
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  // Strip undefined values which Firestore rejects
  const cleanData: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined) {
      cleanData[k] = v;
    }
  }

  const colRef = collection(db, COLLECTION_NAME);
  const docRef = await addDoc(colRef, cleanData);

  return {
    ...cleanData,
    id: docRef.id,
  } as CheckInRecord;
}

/**
 * Records departure / check-out for an active shift.
 */
export async function recordCheckOut(
  payload: CheckOutSubmitPayload
): Promise<CheckInRecord> {
  const docRef = doc(db, COLLECTION_NAME, payload.checkInId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error("Check-in record not found.");
  }

  const existing = snap.data() as CheckInRecord;
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

  if (payload.latitude !== undefined) updates.checkOutLat = payload.latitude;
  if (payload.longitude !== undefined) updates.checkOutLng = payload.longitude;
  if (payload.notes !== undefined) updates.notes = payload.notes;

  await updateDoc(docRef, updates);

  return {
    ...existing,
    ...updates,
    id: snap.id,
  };
}

/**
 * Retrieves today's active check-in record for a specific store if one exists.
 */
export async function getStoreTodayCheckIn(
  campaignId: string,
  storeCode: string,
  dateStr?: string
): Promise<CheckInRecord | null> {
  const targetDate = dateStr || getTodayDateStr();
  const cleanCode = storeCode.trim().toLowerCase();

  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("campaignId", "==", campaignId),
      where("shiftDate", "==", targetDate)
    );

    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data() as CheckInRecord;
      if (data.storeCode && data.storeCode.trim().toLowerCase() === cleanCode) {
        return { ...data, id: d.id };
      }
    }
  } catch (err) {
    console.warn("Could not query store today check-in:", err);
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
    // Fallback without orderBy in case composite index is not yet built
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
 * Increments or decrements the shift sample/engagement counter (+1 sample).
 */
export async function updateShiftSampleCounter(
  checkInId: string,
  delta: number
): Promise<number> {
  const docRef = doc(db, COLLECTION_NAME, checkInId);
  await updateDoc(docRef, {
    samplesLogged: increment(delta),
    updatedAt: Date.now(),
  });

  const updatedSnap = await getDoc(docRef);
  return (updatedSnap.data()?.samplesLogged as number) || 0;
}

export async function saveCampaign(campaign: Campaign): Promise<void> {
  const docRef = doc(db, "campaigns", campaign.id || "golden-morn");
  await updateDoc(docRef, { ...campaign, updatedAt: Date.now() }).catch(async () => {
    const { setDoc } = await import("firebase/firestore");
    await setDoc(docRef, { ...campaign, createdAt: Date.now(), updatedAt: Date.now() });
  });
}

/**
 * Ground-truthing: updates the lat/lng coordinates for a store in a campaign.
 */
export async function updateStoreCoordinates(
  campaignId: string,
  storeCode: string,
  lat: number,
  lng: number
): Promise<boolean> {
  try {
    const docRef = doc(db, "campaigns", campaignId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return false;
    const campaign = snap.data() as Campaign;
    const stores = (campaign.stores || []).map((s) => {
      const code = s.storeCode || (s as any).code || s.id;
      if (code === storeCode) {
        return { ...s, lat, lng };
      }
      return s;
    });
    await updateDoc(docRef, { stores, updatedAt: Date.now() });
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
    geofenceRadius: 150,
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
    geofenceRadius: 100,
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
  const { setDoc } = await import("firebase/firestore");
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

