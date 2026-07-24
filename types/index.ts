export interface Prize {
  id: string;
  label: string;
  color: string;
  /** Relative weight used for the random draw. Weights do not need to sum to 100 — they're normalized. */
  weight: number;
  /** If true, this segment represents a non-winning outcome ("Try Again"). */
  isLosing?: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  welcomeMessage: string;
  prizes: Prize[];
  oneSpinPerPhone: boolean;
  active: boolean;
}

export interface Participant {
  name: string;
  phone: string;
  email?: string;
  campaignId: string;
  prizeId: string;
  prizeLabel: string;
  won: boolean;
  createdAt: number;
}
