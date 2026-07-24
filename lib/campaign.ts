import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  limit,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Campaign, Participant } from "@/types";

export const DEFAULT_CAMPAIGN: Campaign = {
  id: "demo-campaign",
  name: "Dettol Hygiene Challenge",
  subTitle: "GOLDEN MORN",
  logoUrl: "",
  primaryColor: "#0E7C7B",
  secondaryColor: "#F2A93B",
  backgroundColor: "#0e1116",
  gradientStart: "#d97757",
  gradientEnd: "#1d4ed8",
  welcomeMessage: "Spin the wheel for a chance to win instant prizes!",
  oneSpinPerPhone: true,
  active: true,
  adminPin: "1234",
  prizes: [
    { id: "umbrella", label: "Umbrella", color: "#0E7C7B", weight: 2 },
    { id: "tshirt", label: "T-shirt", color: "#F2A93B", weight: 5 },
    { id: "sanitizer", label: "Hand Sanitizer", color: "#0E7C7B", weight: 20 },
    { id: "cap", label: "Face Cap", color: "#F2A93B", weight: 10 },
    { id: "try-again", label: "Try Again", color: "#374151", weight: 60, isLosing: true },
    { id: "bottle", label: "Water Bottle", color: "#F2A93B", weight: 3 },
  ],
};

const LOCAL_STORAGE_KEY_CAMPAIGN = "spin_wheel_campaign_config_v1";
const LOCAL_STORAGE_KEY_PARTICIPANTS = "spin_wheel_participants_v1";

/** Generates a voucher code like SPIN-HW87EIDP */
export function generateVoucherCode(prefix = "SPIN"): string {
  const randomChars = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${prefix}-${randomChars}`;
}

/** Loads campaign configuration with fallback to local storage / defaults */
export async function getCampaign(campaignId = "demo-campaign"): Promise<Campaign> {
  try {
    const ref = doc(db, "campaigns", campaignId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { ...DEFAULT_CAMPAIGN, ...(snap.data() as Partial<Campaign>), id: snap.id };
    }
  } catch (err) {
    console.warn("Firestore campaign fetch failed, checking local storage:", err);
  }

  // Fallback to local storage if present
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_CAMPAIGN}_${campaignId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Ignore parse error
      }
    }
  }

  return DEFAULT_CAMPAIGN;
}

/** Saves updated campaign configuration (Admin action) */
export async function updateCampaign(campaign: Campaign): Promise<void> {
  // Always update local storage first so changes take immediate local effect
  if (typeof window !== "undefined") {
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_CAMPAIGN}_${campaign.id}`,
      JSON.stringify(campaign)
    );
  }

  try {
    const ref = doc(db, "campaigns", campaign.id);
    await setDoc(ref, campaign, { merge: true });
  } catch (err) {
    console.warn("Firestore campaign update failed (saved to local storage instead):", err);
  }
}

/** Checks whether a phone number has already spun for a given campaign. */
export async function hasAlreadySpun(campaignId: string, phone: string): Promise<boolean> {
  const cleanPhone = phone.trim().replace(/\D/g, "");

  try {
    const q = query(
      collection(db, "participants"),
      where("campaignId", "==", campaignId),
      where("phone", "==", phone),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) return true;
  } catch (err) {
    console.warn("Firestore check already spun failed, checking local storage:", err);
  }

  // Local storage check
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PARTICIPANTS}_${campaignId}`);
    if (saved) {
      try {
        const list: Participant[] = JSON.parse(saved);
        return list.some(
          (p) => p.phone.trim().replace(/\D/g, "") === cleanPhone
        );
      } catch (e) {
        // Ignore parse error
      }
    }
  }

  return false;
}

/** Records a participant's spin result. */
export async function recordParticipant(participant: Participant): Promise<string> {
  // Always save to local storage as backup
  if (typeof window !== "undefined") {
    const key = `${LOCAL_STORAGE_KEY_PARTICIPANTS}_${participant.campaignId}`;
    const existing = localStorage.getItem(key);
    let list: Participant[] = [];
    if (existing) {
      try {
        list = JSON.parse(existing);
      } catch (e) {}
    }
    list.unshift(participant);
    localStorage.setItem(key, JSON.stringify(list));
  }

  try {
    const ref = await addDoc(collection(db, "participants"), participant);
    return ref.id;
  } catch (err) {
    console.warn("Firestore record participant failed (saved to local storage):", err);
    return `local-${Date.now()}`;
  }
}

export const SAMPLE_PARTICIPANTS: Participant[] = [
  {
    id: "sample-1",
    name: "Akin Omisakin",
    phone: "080 1234 5678",
    email: "akin@example.com",
    campaignId: "demo-campaign",
    prizeId: "pen",
    prizeLabel: "Pen",
    voucherCode: "SPIN-HW87EIDP",
    won: true,
    createdAt: Date.now() - 1000 * 60 * 15,
  },
  {
    id: "sample-2",
    name: "Chioma Okeke",
    phone: "080 2345 6789",
    email: "chioma@example.com",
    campaignId: "demo-campaign",
    prizeId: "sanitizer",
    prizeLabel: "Hand Sanitizer",
    voucherCode: "SPIN-98A1B2C3",
    won: true,
    createdAt: Date.now() - 1000 * 60 * 45,
  },
  {
    id: "sample-3",
    name: "Chukwudi Eze",
    phone: "081 3456 7890",
    email: "",
    campaignId: "demo-campaign",
    prizeId: "tshirt",
    prizeLabel: "T-shirt",
    voucherCode: "SPIN-45D6E7F8",
    won: true,
    createdAt: Date.now() - 1000 * 60 * 120,
  },
  {
    id: "sample-4",
    name: "Funke Adebayo",
    phone: "070 4567 8901",
    email: "funke@example.com",
    campaignId: "demo-campaign",
    prizeId: "try-again",
    prizeLabel: "Try Again",
    won: false,
    createdAt: Date.now() - 1000 * 60 * 180,
  },
];

/** Fetches participants for admin analytics, exports, and TV display */
export async function getParticipants(campaignId = "demo-campaign"): Promise<Participant[]> {
  let firestoreList: Participant[] = [];

  try {
    const q = query(
      collection(db, "participants"),
      where("campaignId", "==", campaignId),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      firestoreList.push({ id: docSnap.id, ...(docSnap.data() as Participant) });
    });
  } catch (err) {
    console.warn("Firestore getParticipants failed, using local storage:", err);
  }

  if (firestoreList.length > 0) return firestoreList;

  // Fallback / merge local storage items
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PARTICIPANTS}_${campaignId}`);
    if (saved) {
      try {
        const parsed: Participant[] = JSON.parse(saved);
        if (parsed.length > 0) return parsed;
      } catch (e) {}
    }
  }

  return SAMPLE_PARTICIPANTS;
}

