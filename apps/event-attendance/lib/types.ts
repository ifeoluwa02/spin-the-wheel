export interface EventItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  organizer: string;
  description: string;
  venueName: string;
  venueAddress: string;
  city: string;
  state: string;
  startDate: string; // ISO string e.g. 2026-11-15T09:00:00
  endDate: string;
  capacity: number;
  bannerGradient: string;
  adminPin?: string; // Event manager PIN (default e.g. "1234")
  usherPin?: string; // Gate usher PIN (default e.g. "0000")
  customFields?: {
    id: string;
    label: string;
    type: "text" | "select" | "email" | "tel";
    options?: string[];
    required: boolean;
  }[];
  createdAt?: string;
}

export type UserRole = "super-admin" | "admin" | "usher" | "attendee";

export interface AuthSession {
  role: UserRole;
  eventId?: string;
  eventSlug?: string;
  eventName?: string;
  token: string;
  expiresAt: number;
  lastVerifiedAt: number;
}

export interface AttendeeRegistration {
  id: string; // Ticket ID e.g. TKT-LAG-84920
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  fullName: string;
  email: string;
  phone: string;
  organization?: string;
  jobTitle?: string;
  ticketType: "General Admission" | "VIP" | "Speaker" | "Exhibitor" | "Staff";
  qrHash: string; // Encrypted or signed hash
  status: "registered" | "checked_in";
  registeredAt: string;
  checkedInAt?: string;
  checkedInBy?: string;
  customData?: Record<string, string>;
  notes?: string;
}

export interface CheckinResult {
  success: boolean;
  code: "ADMITTED" | "ALREADY_CHECKED_IN" | "INVALID_TICKET" | "WRONG_EVENT" | "SERVER_ERROR";
  message: string;
  attendee?: AttendeeRegistration;
  previousCheckinAt?: string;
}

export interface EventStats {
  totalRegistered: number;
  totalAdmitted: number;
  remaining: number;
  attendanceRate: number;
  admissionsByHour: { hour: string; count: number }[];
}
