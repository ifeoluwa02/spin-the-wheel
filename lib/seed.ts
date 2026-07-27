import { setDoc, doc, collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import type { Campaign, Participant } from "@/types";

export const DEMO_CAMPAIGNS: Campaign[] = [
  {
    id: "demo-campaign",
    name: "Dettol Hygiene Challenge",
    subTitle: "DETTOL NIGERIA",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Dettol_logo.svg/512px-Dettol_logo.svg.png",
    primaryColor: "#00BFA6",
    secondaryColor: "#FF6B35",
    backgroundColor: "#0D1B2A",
    gradientStart: "#00BFA6",
    gradientEnd: "#0D1B2A",
    welcomeMessage: "Spin the Dettol wheel for a chance to win instant hygiene packs & hampers!",
    oneSpinPerPhone: true,
    active: true,
    adminPin: "1234",
    prizes: [
      { id: "sanitizer", label: "Dettol Sanitizer Pack", color: "#00BFA6", weight: 25 },
      { id: "tshirt", label: "Branded Polo T-shirt", color: "#FF6B35", weight: 15 },
      { id: "soap-pack", label: "6-in-1 Soap Bundle", color: "#00BFA6", weight: 20 },
      { id: "towel", label: "Luxury Microfiber Towel", color: "#FF6B35", weight: 10 },
      { id: "try-again", label: "Try Again", color: "#1E293B", weight: 25, isLosing: true },
      { id: "grand-hamper", label: "Grand Hygiene Hamper", color: "#F59E0B", weight: 5 },
    ],
  },
  {
    id: "golden-morn",
    name: "Golden Morn Breakfast Spin",
    subTitle: "NESTLE NIGERIA",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/thumb/f/f6/Nestle_text_logo.svg/512px-Nestle_text_logo.svg.png",
    primaryColor: "#FF6B35",
    secondaryColor: "#F59E0B",
    backgroundColor: "#0D1B2A",
    gradientStart: "#FF6B35",
    gradientEnd: "#F59E0B",
    welcomeMessage: "Fuel your day! Spin to win Golden Morn breakfast packs and cereal bowls.",
    oneSpinPerPhone: true,
    active: true,
    adminPin: "1234",
    prizes: [
      { id: "cereal-pack", label: "1kg Golden Morn Pack", color: "#FF6B35", weight: 30 },
      { id: "cereal-bowl", label: "Custom Breakfast Bowl", color: "#F59E0B", weight: 20 },
      { id: "milk-voucher", label: "N2,000 Milk Voucher", color: "#00BFA6", weight: 15 },
      { id: "try-again", label: "Better Luck Next Time", color: "#1E293B", weight: 25, isLosing: true },
      { id: "backpack", label: "School Backpack", color: "#FF6B35", weight: 10 },
    ],
  },
  {
    id: "coke-zero",
    name: "Coca-Cola Refresh & Win",
    subTitle: "COCA-COLA BOTTLING",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Coca-Cola_logo.svg/512px-Coca-Cola_logo.svg.png",
    primaryColor: "#EF4444",
    secondaryColor: "#111827",
    backgroundColor: "#0F172A",
    gradientStart: "#EF4444",
    gradientEnd: "#111827",
    welcomeMessage: "Chill out! Spin for cool Coca-Cola merchandise and movie tickets.",
    oneSpinPerPhone: true,
    active: true,
    adminPin: "1234",
    prizes: [
      { id: "coke-case", label: "Case of Coke Zero", color: "#EF4444", weight: 20 },
      { id: "movie-ticket", label: "2x Filmhouse Movie Tickets", color: "#F59E0B", weight: 15 },
      { id: "ice-cooler", label: "Portable Cooler Box", color: "#EF4444", weight: 5 },
      { id: "headphone", label: "Wireless Earbuds", color: "#00BFA6", weight: 10 },
      { id: "try-again", label: "Try Again Next Time", color: "#1F2937", weight: 35, isLosing: true },
      { id: "cap", label: "Coke Snapback Cap", color: "#EF4444", weight: 15 },
    ],
  },
];

export const DEMO_PARTICIPANTS: Omit<Participant, "id">[] = [
  {
    name: "Akin Omisakin",
    phone: "08012345678",
    email: "akin.o@gmail.com",
    campaignId: "demo-campaign",
    prizeId: "sanitizer",
    prizeLabel: "Dettol Sanitizer Pack",
    voucherCode: "DETTOL-AK89X1",
    won: true,
    createdAt: Date.now() - 1000 * 60 * 12,
  },
  {
    name: "Chioma Okeke",
    phone: "08023456789",
    email: "chioma.okeke@yahoo.com",
    campaignId: "demo-campaign",
    prizeId: "tshirt",
    prizeLabel: "Branded Polo T-shirt",
    voucherCode: "DETTOL-CH44B9",
    won: true,
    createdAt: Date.now() - 1000 * 60 * 35,
  },
  {
    name: "Emeka Nwosu",
    phone: "08134567890",
    email: "emeka@techcorp.ng",
    campaignId: "demo-campaign",
    prizeId: "try-again",
    prizeLabel: "Try Again",
    won: false,
    createdAt: Date.now() - 1000 * 60 * 75,
  },
  {
    name: "Funke Adebayo",
    phone: "07045678901",
    email: "funke.ade@hotmail.com",
    campaignId: "demo-campaign",
    prizeId: "soap-pack",
    prizeLabel: "6-in-1 Soap Bundle",
    voucherCode: "DETTOL-FK77P2",
    won: true,
    createdAt: Date.now() - 1000 * 60 * 140,
  },
  {
    name: "Tunde Bakare",
    phone: "08098765432",
    email: "tbakare@gmail.com",
    campaignId: "golden-morn",
    prizeId: "cereal-pack",
    prizeLabel: "1kg Golden Morn Pack",
    voucherCode: "GOLD-TB12K9",
    won: true,
    createdAt: Date.now() - 1000 * 60 * 20,
  },
  {
    name: "Zainab Bello",
    phone: "08187654321",
    email: "zbello@yahoo.com",
    campaignId: "golden-morn",
    prizeId: "cereal-bowl",
    prizeLabel: "Custom Breakfast Bowl",
    voucherCode: "GOLD-ZB99M4",
    won: true,
    createdAt: Date.now() - 1000 * 60 * 50,
  },
  {
    name: "David Adeleke",
    phone: "08033334444",
    email: "david@vibes.ng",
    campaignId: "coke-zero",
    prizeId: "coke-case",
    prizeLabel: "Case of Coke Zero",
    voucherCode: "COKE-DA88V1",
    won: true,
    createdAt: Date.now() - 1000 * 60 * 10,
  },
  {
    name: "Blessing Egwu",
    phone: "07011112222",
    email: "blessing.e@outlook.com",
    campaignId: "coke-zero",
    prizeId: "movie-ticket",
    prizeLabel: "2x Filmhouse Movie Tickets",
    voucherCode: "COKE-BE55X3",
    won: true,
    createdAt: Date.now() - 1000 * 60 * 60,
  },
];

/** Seeds demo campaigns and participants directly into Firebase Firestore */
export async function seedFirebaseData(): Promise<{ campaignsSeeded: number; participantsSeeded: number }> {
  let campaignsSeeded = 0;
  let participantsSeeded = 0;

  // 1. Seed Campaigns
  for (const campaign of DEMO_CAMPAIGNS) {
    try {
      const ref = doc(db, "campaigns", campaign.id);
      await setDoc(ref, campaign, { merge: true });
      campaignsSeeded++;
    } catch (err) {
      console.error(`Failed to seed campaign ${campaign.id}:`, err);
    }
  }

  // 2. Seed Participants
  for (const participant of DEMO_PARTICIPANTS) {
    try {
      await addDoc(collection(db, "participants"), participant);
      participantsSeeded++;
    } catch (err) {
      console.error("Failed to seed participant:", err);
    }
  }

  return { campaignsSeeded, participantsSeeded };
}
