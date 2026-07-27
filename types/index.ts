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
  adminPin?: string; // Default secret pin, e.g. "1234" or "8888"
}

export interface Participant {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  campaignId: string;
  prizeId: string;
  prizeLabel: string;
  voucherCode?: string;
  won: boolean;
  createdAt: number;
}

