import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  limit,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Campaign, Participant } from "@/types";

/** Loads a campaign's config (prizes, colors, copy) from Firestore. */
export async function getCampaign(campaignId: string): Promise<Campaign | null> {
  const ref = doc(db, "campaigns", campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Campaign, "id">) };
}

/** Checks whether a phone number has already spun for a given campaign. */
export async function hasAlreadySpun(campaignId: string, phone: string): Promise<boolean> {
  const q = query(
    collection(db, "participants"),
    where("campaignId", "==", campaignId),
    where("phone", "==", phone),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/** Records a participant's spin result. */
export async function recordParticipant(participant: Participant): Promise<string> {
  const ref = await addDoc(collection(db, "participants"), participant);
  return ref.id;
}
