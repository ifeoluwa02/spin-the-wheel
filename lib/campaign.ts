import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  limit,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Campaign, Participant, SuperAdminConfig } from "@/types";
import { normalizeNigerianPhone } from "./phone";

export const DEFAULT_CAMPAIGN: Campaign = {
  id: "",
  name: "",
  primaryColor: "#00BFA6",
  secondaryColor: "#FF6B35",
  backgroundColor: "#0D1B2A",
  gradientStart: "#FF6B35",
  gradientEnd: "#00BFA6",
  welcomeMessage: "Spin the wheel for a chance to win instant prizes!",
  oneSpinPerPhone: true,
  active: true,
  prizes: [],
  stores: [],
};

/** Generates a voucher code like SPIN-HW87EIDP */
export function generateVoucherCode(prefix = "SPIN"): string {
  const randomChars = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${prefix}-${randomChars}`;
}

/** Loads campaign configuration strictly from Firestore */
export async function getCampaign(campaignId: string): Promise<Campaign | null> {
  if (!campaignId) return null;
  try {
    const ref = doc(db, "campaigns", campaignId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { ...DEFAULT_CAMPAIGN, ...(snap.data() as Partial<Campaign>), id: snap.id };
    }
  } catch (err) {
    console.warn("Firestore campaign fetch failed:", err);
  }
  return null;
}

/** Subscribes to real-time changes of a campaign document in Firestore */
export function subscribeCampaign(
  campaignId: string,
  callback: (campaign: Campaign) => void
): () => void {
  const ref = doc(db, "campaigns", campaignId);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      callback({ ...DEFAULT_CAMPAIGN, ...(snap.data() as Partial<Campaign>), id: snap.id });
    }
  });
}

/** Saves updated campaign configuration strictly to Firestore (Admin action) */
export async function updateCampaign(campaign: Campaign): Promise<void> {
  try {
    const ref = doc(db, "campaigns", campaign.id);
    const cleanCampaign = JSON.parse(JSON.stringify(campaign));
    await setDoc(ref, cleanCampaign, { merge: true });
  } catch (err) {
    console.error("Firestore campaign update failed:", err);
    throw err;
  }
}

/** Checks whether a phone number has already spun for a given campaign. */
export async function hasAlreadySpun(campaignId: string, phone: string): Promise<boolean> {
  const cleanPhone = normalizeNigerianPhone(phone) || phone.trim().replace(/\D/g, "");
  if (!cleanPhone || !campaignId) return false;

  try {
    const q = query(
      collection(db, "participants"),
      where("campaignId", "==", campaignId),
      where("phone", "==", cleanPhone),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) return true;
  } catch (err) {
    console.warn("Firestore check already spun failed:", err);
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

/** Records a participant's spin result strictly into Firestore and updates inventory pool. */
export async function recordParticipant(participant: Participant): Promise<string> {
  const normalizedPhone = normalizeNigerianPhone(participant.phone) || (participant.phone ? participant.phone.trim().replace(/\D/g, "") : "");

  // Build a clean, serializable object with zero undefined fields (Firestore strictly rejects undefined)
  const cleanParticipant: Record<string, any> = {
    name: participant.name || "Anonymous",
    phone: normalizedPhone,
    email: participant.email || "",
    campaignId: participant.campaignId || "",
    prizeId: participant.prizeId || "",
    prizeLabel: participant.prizeLabel || "Unknown",
    voucherCode: participant.voucherCode || "",
    won: Boolean(participant.won),
    createdAt: participant.createdAt || Date.now(),
    storeCode: participant.storeCode || "",
    storeName: participant.storeName || "",
  };

  // If the participant won a prize, deduct 1 from available stock pool
  if (cleanParticipant.won && cleanParticipant.prizeId && cleanParticipant.campaignId) {
    incrementPrizeClaimed(cleanParticipant.campaignId, cleanParticipant.prizeId).catch(() => {});
  }

  try {
    const ref = await addDoc(collection(db, "participants"), cleanParticipant);
    return ref.id;
  } catch (err) {
    console.error("Firestore record participant failed:", err);
    throw err;
  }
}

/** Fetches participants for admin analytics, exports, and TV display */
export async function getParticipants(campaignId: string): Promise<Participant[]> {
  const list: Participant[] = [];
  if (!campaignId) return list;
  try {
    // Query by campaignId without orderBy to prevent Firestore index errors; sort in memory
    const q = query(
      collection(db, "participants"),
      where("campaignId", "==", campaignId)
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...(docSnap.data() as Participant) });
    });
  } catch (err) {
    console.warn("Firestore getParticipants failed:", err);
  }

  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** Subscribes to real-time participant entries for a campaign */
export function subscribeParticipants(
  campaignId: string,
  callback: (participants: Participant[]) => void
): () => void {
  // Query by campaignId without orderBy to avoid index requirements; sort in memory on update
  const q = query(
    collection(db, "participants"),
    where("campaignId", "==", campaignId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: Participant[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...(docSnap.data() as Participant) });
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    },
    (err) => {
      console.warn("subscribeParticipants snapshot error:", err);
    }
  );
}

/** Fetches all active & past campaigns for Super Admin Master Portal */
export async function getAllCampaigns(): Promise<Campaign[]> {
  const campaigns: Campaign[] = [];
  try {
    const snap = await getDocs(collection(db, "campaigns"));
    snap.forEach((docSnap) => {
      campaigns.push({ ...DEFAULT_CAMPAIGN, ...(docSnap.data() as Partial<Campaign>), id: docSnap.id });
    });
  } catch (err) {
    console.warn("Firestore getAllCampaigns failed:", err);
  }
  return campaigns;
}

/** Fetches all participant spin records across all campaigns for Super Admin global export */
export async function getAllGlobalParticipants(): Promise<Participant[]> {
  const allParticipants: Participant[] = [];
  try {
    const snap = await getDocs(collection(db, "participants"));
    snap.forEach((docSnap) => {
      allParticipants.push({ id: docSnap.id, ...(docSnap.data() as Participant) });
    });
  } catch (err) {
    console.warn("Firestore getAllGlobalParticipants failed:", err);
  }

  return allParticipants;
}

/** Wipes participant records and resets prize claimed counts in Firestore */
export async function clearCampaignData(campaignId?: string): Promise<{ deletedCount: number }> {
  let deletedCount = 0;

  // 1. Delete participant documents from Firestore
  try {
    const q = campaignId
      ? query(collection(db, "participants"), where("campaignId", "==", campaignId))
      : query(collection(db, "participants"));
    const snap = await getDocs(q);
    const deletePromises = snap.docs.map((docSnap) => {
      deletedCount++;
      return deleteDoc(doc(db, "participants", docSnap.id));
    });
    await Promise.all(deletePromises);
  } catch (err) {
    console.error("Error clearing participants from Firestore:", err);
    throw err;
  }

  // 2. Reset claimedCount on campaign prizes in Firestore
  if (campaignId) {
    try {
      const campaign = await getCampaign(campaignId);
      if (campaign && campaign.prizes) {
        const resetPrizes = campaign.prizes.map((p) => ({ ...p, claimedCount: 0 }));
        await updateCampaign({ ...campaign, prizes: resetPrizes });
      }
    } catch (err) {
      console.error("Error resetting prize claimed counts:", err);
    }
  }

  // 3. Clear any legacy browser local storage
  if (typeof window !== "undefined") {
    localStorage.clear();
  }

  return { deletedCount };
}
/** Reads the Super Admin master credentials from Firestore config/superAdmin */
export async function getSuperAdminConfig(): Promise<SuperAdminConfig | null> {
  try {
    const snap = await getDoc(doc(db, "config", "superAdmin"));
    if (snap.exists()) return snap.data() as SuperAdminConfig;
  } catch (err) {
    console.warn("getSuperAdminConfig failed:", err);
  }
  return null;
}

/** Writes the Super Admin master credentials to Firestore config/superAdmin */
export async function setSuperAdminConfig(config: SuperAdminConfig): Promise<void> {
  await setDoc(doc(db, "config", "superAdmin"), config);
}
