export interface Prize {
  id: string;
  label: string;
  color: string;
  /** Relative weight used for probability calculations (e.g. 2, 5, 20, 10, 60, 3) */
  weight: number;
  /** If true, this segment represents a non-winning outcome ("Try Again"). */
  isLosing?: boolean;
  /** Custom voucher prefix or custom message (optional) */
  voucherPrefix?: string;
  /** Total gift inventory pool allocated for this item (undefined/null = unlimited) */
  quantity?: number;
  /** Number of times this prize item has been won and claimed so far */
  claimedCount?: number;
}

export interface StoreLocation {
  id: string;
  name: string; // e.g. "Shoprite Ikeja" or "BA - Mary Johnson"
  code: string; // e.g. "shoprite-ikeja" or "ba-mary"
  pin?: string; // Optional access PIN for this store/BA
  city?: string;
}

export interface Campaign {
  id: string;
  name: string;
  subTitle?: string; // e.g. "GOLDEN MORN" or "Dettol Hygiene Challenge"
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  gradientStart?: string;
  gradientEnd?: string;
  welcomeMessage: string;
  prizes: Prize[];
  oneSpinPerPhone: boolean;
  active: boolean;
  adminPin?: string;        // Legacy fallback — superseded by adminEmail + adminPassword
  adminEmail?: string;     // Login email assigned to the brand admin by Super Admin
  adminPassword?: string;  // Login password assigned to the brand admin by Super Admin
  stores?: StoreLocation[]; // Field activation locations / Brand Ambassador accounts
}

/** Stored in Firestore config/superAdmin — set once during first-run setup */
export interface SuperAdminConfig {
  email: string;
  password: string;
}

export const AGE_RANGES = [
  "0 - 12",
  "13 - 17",
  "18 - 25",
  "26 - 35",
  "36 - 45",
  "46 - 60",
  "60+",
] as const;

export type AgeRange = typeof AGE_RANGES[number];

export const GENDERS = [
  "Male",
  "Female",
  "Prefer not to say",
] as const;

export type Gender = typeof GENDERS[number];

export interface Participant {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  ageRange?: string;
  gender?: string;
  campaignId: string;
  prizeId: string;
  prizeLabel: string;
  voucherCode?: string;
  won: boolean;
  createdAt: number;
  storeCode?: string; // Track which Store or BA generated the spin
  storeName?: string; // Display name of the Store or BA
}

