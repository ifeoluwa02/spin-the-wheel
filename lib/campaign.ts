import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  limit,
  orderBy,
  onSnapshot,
  increment,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Campaign, Participant, SuperAdminConfig, StoreInventoryRecord } from "@/types";
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

// ---------- Campaign Config Cache (sessionStorage) ----------
// Caches the campaign document in sessionStorage for the lifetime of the browser tab.
// This eliminates repeat reads when the user refreshes or navigates back, and drastically
// reduces Firestore read consumption when 100s of users hit the page simultaneously.
const CAMPAIGN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedCampaign(campaignId: string): Campaign | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`campaign_cache_${campaignId}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: Campaign; ts: number };
    if (Date.now() - ts > CAMPAIGN_CACHE_TTL_MS) {
      sessionStorage.removeItem(`campaign_cache_${campaignId}`);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedCampaign(campaign: Campaign): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      `campaign_cache_${campaign.id}`,
      JSON.stringify({ data: campaign, ts: Date.now() })
    );
  } catch {
    // sessionStorage quota exceeded — silently skip caching
  }
}

/** Invalidates the local campaign cache. Call this after any admin write so the next
 *  participant load fetches a fresh copy of the updated configuration. */
export function invalidateCampaignCache(campaignId: string): void {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(`campaign_cache_${campaignId}`); } catch { /* noop */ }
}

/** Loads campaign configuration from Firestore, with a 5-minute sessionStorage cache.
 *  Pass forceRefresh=true (e.g. from admin writes) to bypass the cache. */
export async function getCampaign(campaignId: string, forceRefresh = false): Promise<Campaign | null> {
  if (!campaignId) return null;

  // Return cached version if still fresh and not explicitly skipped
  if (!forceRefresh) {
    const cached = getCachedCampaign(campaignId);
    if (cached) return cached;
  }

  try {
    const ref = doc(db, "campaigns", campaignId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const campaign = { ...DEFAULT_CAMPAIGN, ...(snap.data() as Partial<Campaign>), id: snap.id };
      setCachedCampaign(campaign);
      return campaign;
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
    invalidateCampaignCache(campaign.id);
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

/** Atomically increments claimedCount for a prize using FieldValue.increment.
 *
 *  WHY: The old implementation used read → mutate → write which causes a race
 *  condition when many users spin simultaneously — all reads return the same
 *  count, all compute count+1, and all write the same value. FieldValue.increment
 *  is processed server-side atomically so each concurrent call correctly adds 1.
 *
 *  Prizes are stored as an array inside the campaign document. Firestore does not
 *  support FieldValue.increment on individual array elements by index, so we store
 *  a separate lightweight counter document per prize in the `prizeCounts` sub-collection.
 *  The admin dashboard reads the campaign document for display; this counter is used
 *  only for accurate real-time stock tracking.
 */
export async function incrementPrizeClaimed(campaignId: string, prizeId: string): Promise<void> {
  if (!campaignId || !prizeId) return;
  try {
    const counterRef = doc(db, "campaigns", campaignId, "prizeCounts", prizeId);
    // increment() is fully atomic and concurrent-safe — no read needed
    await updateDoc(counterRef, { claimedCount: increment(1) }).catch(async () => {
      // Counter doc doesn't exist yet on first win — create it
      await setDoc(counterRef, { prizeId, campaignId, claimedCount: 1 }, { merge: true });
    });
    // Bust the local cache so the next getCampaign call fetches fresh prize counts
    invalidateCampaignCache(campaignId);
  } catch (err) {
    console.warn("Failed to increment prize claimed count:", err);
  }
}

/**
 * Atomically increments the store-specific claimed count for a prize.
 * Stored at campaigns/{campaignId}/storeInventory/{storeCode}
 * Fully atomic with FieldValue.increment — safe under high concurrency (100+ simultaneous spins).
 */
export async function incrementStorePrizeClaimed(
  campaignId: string,
  storeCode: string,
  prizeId: string
): Promise<void> {
  if (!campaignId || !storeCode || !prizeId) return;
  try {
    const cleanStoreCode = storeCode.trim().toLowerCase();
    const inventoryRef = doc(db, "campaigns", campaignId, "storeInventory", cleanStoreCode);
    await updateDoc(inventoryRef, {
      [`claimedCounts.${prizeId}`]: increment(1),
      updatedAt: Date.now(),
    }).catch(async () => {
      await setDoc(
        inventoryRef,
        {
          storeCode: cleanStoreCode,
          claimedCounts: { [prizeId]: 1 },
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    });
  } catch (err) {
    console.warn("Failed to increment store prize claimed count:", err);
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
    ageRange: participant.ageRange || "",
    gender: participant.gender || "",
    campaignId: participant.campaignId || "",
    prizeId: participant.prizeId || "",
    prizeLabel: participant.prizeLabel || "Unknown",
    voucherCode: participant.voucherCode || "",
    won: Boolean(participant.won),
    createdAt: participant.createdAt || Date.now(),
    storeCode: participant.storeCode || "",
    storeName: participant.storeName || "",
  };

  // If the participant won a prize, deduct 1 from both global and store-specific available stock pool
  if (cleanParticipant.won && cleanParticipant.prizeId && cleanParticipant.campaignId) {
    incrementPrizeClaimed(cleanParticipant.campaignId, cleanParticipant.prizeId).catch(() => {});
    if (cleanParticipant.storeCode) {
      incrementStorePrizeClaimed(
        cleanParticipant.campaignId,
        cleanParticipant.storeCode,
        cleanParticipant.prizeId
      ).catch(() => {});
    }
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

  // 2. Reset claimedCount on campaign prizes in Firestore and wipe sub-collections
  if (campaignId) {
    try {
      const campaign = await getCampaign(campaignId);
      if (campaign && campaign.prizes) {
        const resetPrizes = campaign.prizes.map((p) => ({ ...p, claimedCount: 0 }));
        await updateCampaign({ ...campaign, prizes: resetPrizes });
      }

      // Delete prizeCounts sub-collection
      const prizeCountsSnap = await getDocs(collection(db, "campaigns", campaignId, "prizeCounts"));
      await Promise.all(prizeCountsSnap.docs.map((d) => deleteDoc(d.ref)));

      // Delete storeInventory sub-collection
      const storeInvSnap = await getDocs(collection(db, "campaigns", campaignId, "storeInventory"));
      await Promise.all(storeInvSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (err) {
      console.error("Error resetting prize claimed counts and store inventory:", err);
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

// ─────────────────────────────────────────────────────────────────────────────
// Store-Specific Inventory & Prize Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates the allocated quota for a specific prize at a given store.
 * 1. If store has customAllocations[prizeId] set, uses that custom number.
 * 2. Else if prize has an allocated quantity and stores exist, divides equally:
 *    floor(prize.quantity / totalStores).
 * 3. Else returns prize.quantity (or null if unlimited).
 */
export function getStorePrizeQuota(
  campaign: Campaign,
  storeCode: string,
  prizeId: string
): number | null {
  const prize = campaign.prizes?.find((p) => p.id === prizeId);
  if (!prize) return 0;
  if (prize.isLosing || prize.quantity === undefined || prize.quantity === null || prize.quantity < 0) {
    return null; // Unlimited stock
  }

  const cleanStoreCode = (storeCode || "").trim().toLowerCase();
  if (!cleanStoreCode) {
    return prize.quantity;
  }

  const store = campaign.stores?.find(
    (s) =>
      (s.code && s.code.toLowerCase() === cleanStoreCode) ||
      (s.id && s.id.toLowerCase() === cleanStoreCode)
  );

  // Check custom allocation override first
  if (store?.customAllocations?.[prizeId] !== undefined) {
    return Math.max(0, store.customAllocations[prizeId]);
  }

  // Equal split across all configured stores
  const totalStores = campaign.stores?.length || 1;
  return Math.floor(prize.quantity / totalStores);
}

/**
 * Calculates the remaining stock for a prize at a specific store.
 * Returns null if unlimited.
 */
export function getStorePrizeRemaining(
  campaign: Campaign,
  storeCode: string,
  prizeId: string,
  claimedCounts?: Record<string, number>
): number | null {
  const quota = getStorePrizeQuota(campaign, storeCode, prizeId);
  if (quota === null) return null; // Unlimited stock
  const claimed = claimedCounts?.[prizeId] || 0;
  return Math.max(0, quota - claimed);
}

/**
 * Returns the effective prizes for a given store after applying:
 * 1. Global pause (prize.globallyPaused === true) — removed from everyone
 * 2. Per-store pause (store.pausedPrizes includes prizeId) — removed from this store only
 * 3. Per-store stock exhaustion (remaining <= 0) — removed when store quota is consumed
 * Losing/Try-Again segments are never filtered out.
 */
export function getEffectivePrizes(
  campaign: import("@/types").Campaign,
  storeCode: string,
  storeClaimedCounts?: Record<string, number>
): import("@/types").Prize[] {
  if (!campaign || !campaign.prizes) return [];

  const cleanStoreCode = (storeCode || "").trim().toLowerCase();
  const store = cleanStoreCode
    ? campaign.stores?.find(
        (s) =>
          (s.code && s.code.toLowerCase() === cleanStoreCode) ||
          (s.id && s.id.toLowerCase() === cleanStoreCode)
      )
    : undefined;
  const storePausedPrizes: string[] = store?.pausedPrizes || [];

  const filtered = campaign.prizes.filter((prize) => {
    if (prize.isLosing) return true; // never filter out losing segments
    if (prize.globallyPaused) return false; // global pause — excluded everywhere
    if (storePausedPrizes.includes(prize.id)) return false; // per-store pause

    // Check store-specific stock depletion if storeCode is provided and claimedCounts are supplied
    if (cleanStoreCode && storeClaimedCounts && prize.quantity !== undefined && prize.quantity !== null && prize.quantity >= 0) {
      const remaining = getStorePrizeRemaining(campaign, cleanStoreCode, prize.id, storeClaimedCounts);
      if (remaining !== null && remaining <= 0) {
        return false; // Out of stock at this store
      }
    }

    return true;
  });

  // Safety fallback: if all winning prizes are paused/depleted and no losing segment exists,
  // return a fallback "Try Again" so the wheel canvas is never empty and never divides by 0
  if (filtered.length === 0 && campaign.prizes.length > 0) {
    return [{
      id: "fallback-try-again",
      label: "Try Again",
      color: "#6b7280",
      weight: 100,
      isLosing: true,
    }];
  }

  return filtered;
}

/** Fetches the inventory claimed counts for a specific store */
export async function getStoreInventory(
  campaignId: string,
  storeCode: string
): Promise<StoreInventoryRecord | null> {
  if (!campaignId || !storeCode) return null;
  try {
    const cleanStoreCode = storeCode.trim().toLowerCase();
    const ref = doc(db, "campaigns", campaignId, "storeInventory", cleanStoreCode);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as StoreInventoryRecord;
    }
  } catch (err) {
    console.warn("Firestore getStoreInventory failed:", err);
  }
  return null;
}

/** Subscribes to real-time inventory updates for a specific store */
export function subscribeStoreInventory(
  campaignId: string,
  storeCode: string,
  callback: (inventory: StoreInventoryRecord | null) => void
): () => void {
  if (!campaignId || !storeCode) {
    callback(null);
    return () => {};
  }
  const cleanStoreCode = storeCode.trim().toLowerCase();
  const ref = doc(db, "campaigns", campaignId, "storeInventory", cleanStoreCode);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as StoreInventoryRecord);
      } else {
        callback(null);
      }
    },
    (err) => {
      console.warn("subscribeStoreInventory snapshot error:", err);
    }
  );
}

/** Fetches all store inventory records for a campaign */
export async function getAllStoreInventories(
  campaignId: string
): Promise<Record<string, StoreInventoryRecord>> {
  const result: Record<string, StoreInventoryRecord> = {};
  if (!campaignId) return result;
  try {
    const colRef = collection(db, "campaigns", campaignId, "storeInventory");
    const snap = await getDocs(colRef);
    snap.forEach((docSnap) => {
      result[docSnap.id] = docSnap.data() as StoreInventoryRecord;
    });
  } catch (err) {
    console.warn("getAllStoreInventories failed:", err);
  }
  return result;
}


/**
 * Globally pauses a prize across all stores.
 * Directly updates Firestore document field to prevent cache race conditions.
 */
export async function pausePrizeGlobally(
  campaignId: string,
  prizeId: string
): Promise<void> {
  const ref = doc(db, "campaigns", campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const c = snap.data() as Campaign;
  const prizes = (c.prizes || []).map((p) =>
    p.id === prizeId ? { ...p, globallyPaused: true } : p
  );
  await updateDoc(ref, { prizes });
  invalidateCampaignCache(campaignId);
}

/**
 * Removes global pause from a prize, making it available again at all stores.
 * Directly updates Firestore document field to prevent cache race conditions.
 */
export async function unpausePrizeGlobally(
  campaignId: string,
  prizeId: string
): Promise<void> {
  const ref = doc(db, "campaigns", campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const c = snap.data() as Campaign;
  const prizes = (c.prizes || []).map((p) =>
    p.id === prizeId ? { ...p, globallyPaused: false } : p
  );
  await updateDoc(ref, { prizes });
  invalidateCampaignCache(campaignId);
}

/**
 * Pauses a specific prize at a specific store (per-store pause).
 * Can be called by Supervisor (for their store) or Admin.
 * Directly reads latest Firestore document and updates stores field.
 */
export async function pausePrizeAtStore(
  campaignId: string,
  storeIdOrCode: string,
  prizeId: string
): Promise<void> {
  const ref = doc(db, "campaigns", campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const c = snap.data() as Campaign;
  const clean = storeIdOrCode.trim().toLowerCase();
  const stores = (c.stores || []).map((s) => {
    if (s.id.toLowerCase() !== clean && s.code?.toLowerCase() !== clean) return s;
    const current = s.pausedPrizes || [];
    return current.includes(prizeId) ? s : { ...s, pausedPrizes: [...current, prizeId] };
  });
  await updateDoc(ref, { stores });
  invalidateCampaignCache(campaignId);
}

/**
 * Removes per-store pause, restoring a prize at that specific store.
 * Can be called by Supervisor (for their store) or Admin.
 * Directly reads latest Firestore document and updates stores field.
 */
export async function unpausePrizeAtStore(
  campaignId: string,
  storeIdOrCode: string,
  prizeId: string
): Promise<void> {
  const ref = doc(db, "campaigns", campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const c = snap.data() as Campaign;
  const clean = storeIdOrCode.trim().toLowerCase();
  const stores = (c.stores || []).map((s) => {
    if (s.id.toLowerCase() !== clean && s.code?.toLowerCase() !== clean) return s;
    return { ...s, pausedPrizes: (s.pausedPrizes || []).filter((id) => id !== prizeId) };
  });
  await updateDoc(ref, { stores });
  invalidateCampaignCache(campaignId);
}

/**
 * Batch pauses or resumes all winning prizes at a specific store.
 * Directly reads latest Firestore document and updates stores field.
 */
export async function batchToggleStorePrizes(
  campaignId: string,
  storeIdOrCode: string,
  pauseAll: boolean
): Promise<void> {
  const ref = doc(db, "campaigns", campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const c = snap.data() as Campaign;
  const clean = storeIdOrCode.trim().toLowerCase();
  const winningPrizeIds = (c.prizes || [])
    .filter((p) => !p.isLosing && !p.globallyPaused)
    .map((p) => p.id);
  const stores = (c.stores || []).map((s) => {
    if (s.id.toLowerCase() !== clean && s.code?.toLowerCase() !== clean) return s;
    return { ...s, pausedPrizes: pauseAll ? winningPrizeIds : [] };
  });
  await updateDoc(ref, { stores });
  invalidateCampaignCache(campaignId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Supervisor Auth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks supervisor credentials against those stored on the campaign document.
 * Returns the matching Supervisor object or null if not found / wrong password.
 */
export async function getSupervisorByCredentials(
  campaignId: string,
  email: string,
  password: string
): Promise<import("@/types").Supervisor | null> {
  const campaign = await getCampaign(campaignId);
  if (!campaign?.supervisors?.length) return null;
  const match = campaign.supervisors.find(
    (sv) =>
      sv.email.toLowerCase() === email.trim().toLowerCase() &&
      sv.password === password
  );
  return match || null;
}

/**
 * Returns the list of stores that a supervisor has access to,
 * based on their scopeType ("state" or "stores").
 */
export function getSupervisorStores(
  campaign: import("@/types").Campaign,
  supervisor: import("@/types").Supervisor
): import("@/types").StoreLocation[] {
  const stores = campaign.stores || [];
  if (supervisor.scopeType === "state" && supervisor.state) {
    const state = supervisor.state.toLowerCase();
    return stores.filter((s) => s.state?.toLowerCase() === state);
  }
  if (supervisor.scopeType === "stores" && supervisor.storeIds?.length) {
    return stores.filter((s) => supervisor.storeIds!.includes(s.id));
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaign Admin Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all configured admins for a campaign, consolidating
 * legacy primary adminEmail/adminPassword with the newer admins[] array.
 */
export function getAllCampaignAdmins(
  campaign: import("@/types").Campaign
): import("@/types").CampaignAdmin[] {
  const list: import("@/types").CampaignAdmin[] = [];
  if (campaign.adminEmail && campaign.adminPassword) {
    list.push({
      id: "primary-admin",
      name: "Primary Admin",
      email: campaign.adminEmail,
      password: campaign.adminPassword,
    });
  }
  if (campaign.admins?.length) {
    for (const a of campaign.admins) {
      if (!list.some(existing => existing.email.toLowerCase() === a.email.toLowerCase())) {
        list.push(a);
      }
    }
  }
  return list;
}

/**
 * Authenticates whether given email and password belong to an authorized Campaign Admin.
 * Returns the CampaignAdmin object or null.
 */
export function authenticateCampaignAdmin(
  campaign: import("@/types").Campaign,
  email: string,
  password: string
): import("@/types").CampaignAdmin | null {
  const normEmail = email.trim().toLowerCase();
  // Check primary
  if (
    campaign.adminEmail &&
    campaign.adminEmail.toLowerCase() === normEmail &&
    campaign.adminPassword === password
  ) {
    return {
      id: "primary-admin",
      name: "Primary Admin",
      email: campaign.adminEmail,
      password: campaign.adminPassword,
    };
  }
  // Check admins array
  if (campaign.admins?.length) {
    const match = campaign.admins.find(
      (a) => a.email.toLowerCase() === normEmail && a.password === password
    );
    if (match) return match;
  }
  return null;
}

/**
 * Strips sensitive administrative credentials from a campaign object
 * before exposing it to public attendee or kiosk browsers.
 */
export function sanitizeCampaignForPublic(campaign: Campaign): Campaign {
  if (!campaign) return campaign;
  return {
    ...campaign,
    adminPassword: "",
    adminPin: "",
    admins: (campaign.admins || []).map((a) => ({
      ...a,
      password: "",
    })),
    supervisors: (campaign.supervisors || []).map((s) => ({
      ...s,
      password: "",
    })),
  };
}



