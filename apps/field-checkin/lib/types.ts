import { NIGERIAN_STATES, NigerianState } from "@activation/shared";

export { NIGERIAN_STATES };
export type { NigerianState };

export interface StoreLocation {
  id?: string;
  name: string;
  storeCode?: string;
  code?: string;
  state?: string;
  city?: string;
  address?: string;
  pin?: string;
  baName?: string;
  baPhone?: string;
  isActive?: boolean;
  active?: boolean;
  lat?: number;
  lng?: number;
  geofenceRadius?: number;
}

export interface Campaign {
  id?: string;
  name: string;
  brandName?: string;
  stores?: StoreLocation[];
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  active?: boolean;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy?: number; // GPS accuracy radius in meters
}

export type CheckInStatus = "verified" | "flagged" | "checked_out";

export interface CheckInRecord {
  id: string;
  campaignId: string;
  storeCode: string;
  storeName: string;
  baName: string;
  baPhone: string;
  shiftDate: string; // "YYYY-MM-DD"

  // Arrival / Check-in Data
  checkInTime: string; // ISO 8601
  checkInLat: number;
  checkInLng: number;
  checkInAccuracy?: number;
  targetLat: number;
  targetLng: number;
  distanceMeters: number;
  status: CheckInStatus;
  photoUrl?: string; // Morning selfie or storefront proof

  // Shift Activity (No-Wheel / Sampling / Field activity)
  samplesLogged?: number;
  notes?: string;

  // Departure / Check-out Data
  checkOutTime?: string;
  checkOutLat?: number;
  checkOutLng?: number;
  hoursWorked?: number;
  createdAt: number;
  updatedAt: number;
}

export interface GeofenceEvaluation {
  inside: boolean;
  distance: number; // meters
  status: "verified" | "drift" | "out_of_bounds";
  message: string;
}

export interface CheckInSubmitPayload {
  campaignId: string;
  storeCode: string;
  baName: string;
  baPhone: string;
  pin: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  photoUrl?: string;
  isSimulated?: boolean;
}

export interface CheckOutSubmitPayload {
  checkInId: string;
  latitude: number;
  longitude: number;
  notes?: string;
}
