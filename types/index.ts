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
  /**
   * When true, this prize is excluded from ALL stores' wheels globally.
   * Only Campaign Admin (PM) can toggle this.
   */
  globallyPaused?: boolean;
}

export interface StoreLocation {
  id: string;
  name: string; // e.g. "Shoprite Ikeja" or "BA - Mary Johnson"
  code: string; // e.g. "shoprite-ikeja" or "ba-mary"
  pin?: string; // Optional access PIN for this store/BA
  city?: string;
  /** State/region this store belongs to — used to scope supervisors by state */
  state?: string;
  /**
   * Array of prize IDs paused at this specific store.
   * Supervisors can toggle these; Admin can also manage them.
   */
  pausedPrizes?: string[];
}

/**
 * A Supervisor is a field team member who can:
 * - Pause/unpause prizes at their assigned stores
 * - View and download participants data for their stores
 * They cannot edit campaign settings, branding, or prize configurations.
 */
export interface Supervisor {
  id: string;
  name: string;
  email: string;
  password: string;
  /**
   * "state" = supervisor manages ALL stores whose `state` field matches `state`.
   * "stores" = supervisor manages only the specific stores listed in `storeIds`.
   */
  scopeType: "state" | "stores";
  /** Used when scopeType === "state" */
  state?: string;
  /** Used when scopeType === "stores" — array of StoreLocation.id values */
  storeIds?: string[];
}

/**
 * A Campaign Admin (Project Manager / Brand Admin) who has full access to the campaign:
 * - Brand & theme styling
 * - Prize inventory & probabilities
 * - Stores & BAs
 * - Team & Supervisors
 * - Real-time analytics & participant exports
 */
export interface CampaignAdmin {
  id: string;
  name?: string;
  email: string;
  password: string;
  createdAt?: number;
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
  adminEmail?: string;     // Primary/Legacy login email assigned to the brand admin by Super Admin
  adminPassword?: string;  // Primary/Legacy login password assigned to the brand admin by Super Admin
  /** Multiple Brand Admins / Project Managers assigned to this campaign by Super Admin */
  admins?: CampaignAdmin[];
  stores?: StoreLocation[]; // Field activation locations / Brand Ambassador accounts
  /** Supervisors created and managed by the Campaign Admin (PM) */
  supervisors?: Supervisor[];
}

/** Stored in Firestore config/superAdmin — set once during first-run setup */
export interface SuperAdminConfig {
  email: string;
  password: string;
}

export const NIGERIAN_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT (Abuja)",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
] as const;

export type NigerianState = typeof NIGERIAN_STATES[number];

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

/** Role of an authenticated session inside /admin */
export type AdminRole = "admin" | "supervisor";

