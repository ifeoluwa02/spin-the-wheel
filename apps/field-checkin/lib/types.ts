import { NIGERIAN_STATES, NigerianState } from "@activation/shared";

export { NIGERIAN_STATES };
export type { NigerianState };

export interface StorePolygonVertex {
  lat: number;
  lng: number;
}

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
  baUsername?: string;
  baPassword?: string;
  baPhone?: string;
  hasPin?: boolean;
  isActive?: boolean;
  active?: boolean;
  lat?: number;
  lng?: number;
  geofenceRadius?: number;
  polygon?: StorePolygonVertex[];
}

export type SurveyQuestionType = "text" | "tel" | "select" | "radio_consent";

export interface SurveyQuestion {
  id: string;
  label: string;
  type: SurveyQuestionType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  autoFillStoreName?: boolean;
}

export interface Campaign {
  id?: string;
  name: string;
  brandName?: string;
  activationType?: SurveyType;
  geofenceEnabled?: boolean;
  adminUsername?: string;
  adminPassword?: string;
  adminPin?: string;
  stores?: StoreLocation[];
  surveyQuestions?: SurveyQuestion[];
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy?: number; // GPS accuracy radius in meters
  timestamp?: number; // Unix timestamp in ms from GeolocationPosition
}

export interface GpsBreadcrumb {
  timestamp: number;
  lat: number;
  lng: number;
  accuracy?: number;
  distanceMeters: number;
  inside: boolean;
}

export type SpoofRisk = "low" | "medium" | "high";

export type CheckInStatus = "verified" | "flagged" | "checked_out" | "rejected";

export interface CheckInRecord {
  id: string;
  campaignId: string;
  storeCode: string;
  storeName: string;
  baName: string;
  baUsername?: string;
  baPhone: string;
  shiftDate: string; // "YYYY-MM-DD" in Africa/Lagos

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
  photoSha256?: string; // Server-computed SHA-256 integrity hash of photo evidence
  isSimulated?: boolean;
  spoofRisk?: SpoofRisk;
  spoofReasons?: string[];
  deviceId?: string;

  // Continuous Shift Presence & GPS Breadcrumbs (Akida-style live tracking)
  breadcrumbs?: GpsBreadcrumb[];
  lastHeartbeatAt?: number;
  lastLat?: number;
  lastLng?: number;
  lastDistanceMeters?: number;
  inFencePingCount?: number;
  outOfFencePingCount?: number;

  // Shift Activity (No-Wheel / Sampling / Field activity)
  samplesLogged?: number;
  notes?: string;

  // Departure / Check-out Data
  checkOutTime?: string;
  checkOutLat?: number;
  checkOutLng?: number;
  checkOutAccuracy?: number;
  checkOutDistanceMeters?: number;
  checkOutInsideFence?: boolean;
  hoursWorked?: number;

  // Supervisor Flagged Review Audit
  reviewStatus?: "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: number;
  reviewNote?: string;

  createdAt: number;
  updatedAt: number;
}

export interface GeofenceEvaluation {
  inside: boolean;
  distance: number; // meters
  status: "verified" | "drift" | "out_of_bounds";
  message: string;
}

export interface GpsTelemetryEvaluation {
  spoofRisk: SpoofRisk;
  spoofReasons: string[];
  freshnessOk: boolean;
}

export interface CheckInSubmitPayload {
  campaignId: string;
  storeCode: string;
  baName: string;
  baUsername?: string;
  baPhone: string;
  pin: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
  gpsSamples?: GeoPoint[];
  photoUrl?: string;
  deviceId?: string;
  isSimulated?: boolean;
}

export interface CheckOutSubmitPayload {
  checkInId: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  notes?: string;
}

export type SurveyType = "retail" | "hospital";
export type TasteFeedback = "loved_it" | "good" | "neutral" | "disliked";

export interface SurveyRecord {
  id: string;
  campaignId: string;
  checkInId: string;
  storeCode: string;
  storeName: string;
  baName: string;
  shiftDate: string; // "YYYY-MM-DD"
  surveyType: SurveyType;

  // Respondent / Consumer Profile
  respondentName: string;
  respondentPhone: string;

  // Retail Supermarket Survey Fields (e.g., Golden Morn)
  productSampled?: string;
  tasteFeedback?: TasteFeedback;
  purchasedOnShelf?: boolean;
  packsPurchased?: number;

  // Hospital / Clinic Outreach Fields (e.g., Cussons / Molfix ANC & IMC)
  clinicType?: string;
  hospitalName?: string;
  marketingConsent?: boolean;
  marketingConsentLabel?: string;
  motherStage?: "expectant" | "nursing";
  dueOrBirthDate?: string;
  diaperSizeIssued?: "Newborn (Size 1)" | "Size 2" | "Size 3";
  currentBrandUsed?: string;

  // Dynamic Superadmin-configured custom question answers
  surveyAnswers?: Record<string, string>;

  // Geotag at moment of survey submission (Akida parity)
  lat?: number;
  lng?: number;
  accuracy?: number;
  distanceMeters?: number;

  notes?: string;
  createdAt: number;
}
