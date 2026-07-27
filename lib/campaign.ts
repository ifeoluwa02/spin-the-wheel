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
  primaryColor: "#00BFA6",
  secondaryColor: "#FF6B35",
  backgroundColor: "#0D1B2A",
  gradientStart: "#FF6B35",
  gradientEnd: "#00BFA6",
  welcomeMessage: "Spin the wheel for a chance to win instant prizes!",
  oneSpinPerPhone: true,
  active: true,
  adminPin: "1234",
  prizes: [
    { id: "umbrella", label: "Umbrella", color: "#00BFA6", weight: 2 },
    { id: "tshirt", label: "T-shirt", color: "#FF6B35", weight: 5 },
    { id: "sanitizer", label: "Hand Sanitizer", color: "#00BFA6", weight: 20 },
    { id: "cap", label: "Face Cap", color: "#FF6B35", weight: 10 },
    { id: "try-again", label: "Try Again", color: "#0D1B2A", weight: 60, isLosing: true },
    { id: "bottle", label: "Water Bottle", color: "#00BFA6", weight: 3 },
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

/** Increments claimedCount for a prize when won */
export async function incrementPrizeClaimed(campaignId: string, prizeId: string): Promise<void> {
  try {
    const campaign = await getCampaign(campaignId);
    if (!campaign || !campaign.prizes) return;
    let updated = false;
    const prizes = campaign.prizes.map((p) => {
      if (p.id === prizeId) {
        updated = true;
        return { ...p, claimedCount: (p.claimedCount || 0) + 1 };
      }
      return p;
    });
    if (updated) {
      await updateCampaign({ ...campaign, prizes });
    }
  } catch (err) {
    console.warn("Failed to increment prize claimed count:", err);
  }
}

/** Records a participant's spin result and updates inventory pool. */
export async function recordParticipant(participant: Participant): Promise<string> {
  // If the participant won a prize, deduct 1 from available stock pool
  if (participant.won && participant.prizeId) {
    incrementPrizeClaimed(participant.campaignId, participant.prizeId).catch(() => {});
  }

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

/** Fetches all active & past campaigns for Super Admin Master Portal */
export async function getAllCampaigns(): Promise<Campaign[]> {
  let campaigns: Campaign[] = [];

  try {
    const snap = await getDocs(collection(db, "campaigns"));
    snap.forEach((docSnap) => {
      campaigns.push({ ...DEFAULT_CAMPAIGN, ...(docSnap.data() as Partial<Campaign>), id: docSnap.id });
    });
  } catch (err) {
    console.warn("Firestore getAllCampaigns failed, scanning local storage:", err);
  }

  // Scan local storage for saved campaigns
  if (typeof window !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LOCAL_STORAGE_KEY_CAMPAIGN)) {
        try {
          const item: Campaign = JSON.parse(localStorage.getItem(key) || "");
          if (item && item.id && !campaigns.some((c) => c.id === item.id)) {
            campaigns.push(item);
          }
        } catch (e) {}
      }
    }
  }

  if (!campaigns.some((c) => c.id === DEFAULT_CAMPAIGN.id)) {
    campaigns.unshift(DEFAULT_CAMPAIGN);
  }

  return campaigns;
}

/** Fetches all participant spin records across all campaigns for Super Admin global export */
export async function getAllGlobalParticipants(): Promise<Participant[]> {
  let allParticipants: Participant[] = [];

  try {
    const snap = await getDocs(collection(db, "participants"));
    snap.forEach((docSnap) => {
      allParticipants.push({ id: docSnap.id, ...(docSnap.data() as Participant) });
    });
  } catch (err) {
    console.warn("Firestore getAllGlobalParticipants failed, scanning local storage:", err);
  }

  if (typeof window !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LOCAL_STORAGE_KEY_PARTICIPANTS)) {
        try {
          const items: Participant[] = JSON.parse(localStorage.getItem(key) || "[]");
          items.forEach((item) => {
            if (!allParticipants.some((p) => p.phone === item.phone && p.createdAt === item.createdAt)) {
              allParticipants.push(item);
            }
          });
        } catch (e) {}
      }
    }
  }

  if (allParticipants.length === 0) return SAMPLE_PARTICIPANTS;
  return allParticipants;
}


