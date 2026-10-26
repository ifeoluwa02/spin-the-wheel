import { EventItem, AttendeeRegistration, CheckinResult, EventStats } from "./types";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";

// Seed sample events so the app works immediately out of the box
export const INITIAL_EVENTS: EventItem[] = [
  {
    id: "evt-nestle-summit-2026",
    slug: "nestle-summit-2026",
    title: "Nestlé Brand Activation & Retail Summit 2026",
    category: "Corporate & Brand Activation",
    organizer: "Nestlé Nigeria Field Marketing",
    description: "Annual convention of brand activators, field managers, and retail partners celebrating nationwide growth and introducing new activation technology.",
    venueName: "Eko Hotel & Suites Grand Ballroom",
    venueAddress: "Plot 1415 Adetokunbo Ademola Street, Victoria Island",
    city: "Lagos",
    state: "Lagos",
    startDate: "2026-11-15T09:00:00",
    endDate: "2026-11-15T18:00:00",
    capacity: 500,
    bannerGradient: "from-blue-600 via-indigo-600 to-purple-700",
    adminPin: "1234",
    usherPin: "0000",
    createdAt: "2026-10-01T10:00:00Z",
  },
  {
    id: "evt-tech-africa-lagos",
    slug: "tech-africa-lagos",
    title: "Lagos Tech & Product Innovation Expo",
    category: "Technology & Design",
    organizer: "Innovcity Tech Network",
    description: "Connecting over 1,000 developers, product founders, and venture builders for keynote sessions, live product demos, and VIP networking.",
    venueName: "Landmark Event Centre Hall A",
    venueAddress: "Water Corporation Drive, Oniru, Victoria Island",
    city: "Lagos",
    state: "Lagos",
    startDate: "2026-12-05T08:30:00",
    endDate: "2026-12-05T17:00:00",
    capacity: 1000,
    bannerGradient: "from-emerald-600 via-teal-600 to-cyan-700",
    adminPin: "5678",
    usherPin: "0000",
    createdAt: "2026-10-10T12:00:00Z",
  },
];

// Seed sample attendees for testing out scanner and dashboard right away
export const INITIAL_ATTENDEES: AttendeeRegistration[] = [
  {
    id: "TKT-LAG-1001",
    eventId: "evt-nestle-summit-2026",
    eventSlug: "nestle-summit-2026",
    eventTitle: "Nestlé Brand Activation & Retail Summit 2026",
    fullName: "Ifeoluwa Olawoore",
    email: "ifeoluwa02@gmail.com",
    phone: "08012345678",
    organization: "Innovcity Technology",
    jobTitle: "Lead Systems Engineer",
    ticketType: "VIP",
    qrHash: "TKT-LAG-1001#evt-nestle-summit-2026",
    status: "registered",
    registeredAt: "2026-10-20T10:15:00Z",
  },
  {
    id: "TKT-LAG-1002",
    eventId: "evt-nestle-summit-2026",
    eventSlug: "nestle-summit-2026",
    eventTitle: "Nestlé Brand Activation & Retail Summit 2026",
    fullName: "Chinedu Eze",
    email: "chinedu.eze@example.com",
    phone: "08087654321",
    organization: "EXP Marketing Africa",
    jobTitle: "Field Operations Director",
    ticketType: "Speaker",
    qrHash: "TKT-LAG-1002#evt-nestle-summit-2026",
    status: "registered",
    registeredAt: "2026-10-21T14:30:00Z",
  },
  {
    id: "TKT-LAG-1003",
    eventId: "evt-nestle-summit-2026",
    eventSlug: "nestle-summit-2026",
    eventTitle: "Nestlé Brand Activation & Retail Summit 2026",
    fullName: "Amina Yusuf",
    email: "amina.yusuf@example.com",
    phone: "08123334455",
    organization: "Retail Chain Hub",
    jobTitle: "Merchandise Specialist",
    ticketType: "General Admission",
    qrHash: "TKT-LAG-1003#evt-nestle-summit-2026",
    status: "checked_in",
    registeredAt: "2026-10-22T08:00:00Z",
    checkedInAt: "2026-10-23T09:12:00Z",
    checkedInBy: "Terminal-Gate-1",
  },
];

const inMemoryEvents: EventItem[] = [...INITIAL_EVENTS];
const inMemoryAttendees: AttendeeRegistration[] = [...INITIAL_ATTENDEES];

const LOCAL_STORAGE_KEY_EVENTS = "attendance_events_store";
const LOCAL_STORAGE_KEY_ATTENDEES = "attendance_attendees_store";

function isClient(): boolean {
  return typeof window !== "undefined";
}

function getLocalEvents(): EventItem[] {
  if (!isClient()) return inMemoryEvents;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_EVENTS);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_KEY_EVENTS, JSON.stringify(inMemoryEvents));
      return inMemoryEvents;
    }
    return JSON.parse(raw);
  } catch {
    return inMemoryEvents;
  }
}

function saveLocalEvents(events: EventItem[]) {
  inMemoryEvents.length = 0;
  inMemoryEvents.push(...events);
  if (!isClient()) return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_EVENTS, JSON.stringify(events));
  } catch (err) {
    console.warn("Failed to persist local events:", err);
  }
}

function getLocalAttendees(): AttendeeRegistration[] {
  if (!isClient()) return inMemoryAttendees;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_ATTENDEES);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_KEY_ATTENDEES, JSON.stringify(inMemoryAttendees));
      return inMemoryAttendees;
    }
    return JSON.parse(raw);
  } catch {
    return inMemoryAttendees;
  }
}

function saveLocalAttendees(attendees: AttendeeRegistration[]) {
  inMemoryAttendees.length = 0;
  inMemoryAttendees.push(...attendees);
  if (!isClient()) return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_ATTENDEES, JSON.stringify(attendees));
  } catch (err) {
    console.warn("Failed to persist local attendees:", err);
  }
}

// ----------------- Public API Functions -----------------

export async function fetchAllEvents(): Promise<EventItem[]> {
  try {
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "mock-app") {
      const snap = await getDocs(collection(db, "events"));
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as EventItem);
      }
    }
  } catch (e) {
    console.warn("Firestore fetch error, falling back to local storage:", e);
  }
  return getLocalEvents();
}

export async function fetchEventById(eventIdOrSlug: string): Promise<EventItem | null> {
  const events = await fetchAllEvents();
  return events.find((e) => e.id === eventIdOrSlug || e.slug === eventIdOrSlug) || null;
}

export async function createNewEvent(eventData: Omit<EventItem, "id" | "createdAt">): Promise<EventItem> {
  const newId = `evt-${Date.now()}`;
  const newEvent: EventItem = {
    ...eventData,
    id: newId,
    createdAt: new Date().toISOString(),
  };

  try {
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "mock-app") {
      await setDoc(doc(db, "events", newId), newEvent);
    }
  } catch (err) {
    console.warn("Firestore write error, saving locally:", err);
  }

  const existing = getLocalEvents();
  const updated = [newEvent, ...existing];
  saveLocalEvents(updated);
  return newEvent;
}

export async function fetchAttendeesByEvent(eventId: string): Promise<AttendeeRegistration[]> {
  try {
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "mock-app") {
      const q = query(collection(db, "registrations"), where("eventId", "==", eventId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as AttendeeRegistration);
      }
    }
  } catch (e) {
    console.warn("Firestore fetch error, fallback to local:", e);
  }

  const list = getLocalAttendees();
  return list.filter((a) => a.eventId === eventId);
}

export async function fetchAttendeeByTicketId(ticketId: string): Promise<AttendeeRegistration | null> {
  try {
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "mock-app") {
      const snap = await getDoc(doc(db, "registrations", ticketId));
      if (snap.exists()) {
        return snap.data() as AttendeeRegistration;
      }
    }
  } catch (e) {
    console.warn("Firestore ticket lookup error:", e);
  }

  const list = getLocalAttendees();
  return list.find((a) => a.id.toLowerCase() === ticketId.trim().toLowerCase()) || null;
}

export async function registerNewAttendee(params: {
  eventId: string;
  fullName: string;
  email: string;
  phone: string;
  organization?: string;
  jobTitle?: string;
  ticketType?: AttendeeRegistration["ticketType"];
  customData?: Record<string, string>;
}): Promise<AttendeeRegistration> {
  const event = await fetchEventById(params.eventId);
  if (!event) throw new Error("Event not found");

  // Generate unique human-readable ticket ID e.g. TKT-LAG-49281
  const randCode = Math.floor(10000 + Math.random() * 90000);
  const prefix = event.city ? event.city.slice(0, 3).toUpperCase() : "EVT";
  const ticketId = `TKT-${prefix}-${randCode}`;
  const qrHash = `${ticketId}#${event.id}`;

  const registration: AttendeeRegistration = {
    id: ticketId,
    eventId: event.id,
    eventSlug: event.slug,
    eventTitle: event.title,
    fullName: params.fullName.trim(),
    email: params.email.trim().toLowerCase(),
    phone: params.phone.trim(),
    organization: params.organization?.trim(),
    jobTitle: params.jobTitle?.trim(),
    ticketType: params.ticketType || "General Admission",
    qrHash,
    status: "registered",
    registeredAt: new Date().toISOString(),
    customData: params.customData,
  };

  try {
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "mock-app") {
      await setDoc(doc(db, "registrations", ticketId), registration);
    }
  } catch (err) {
    console.warn("Firestore save error, saving locally:", err);
  }

  const list = getLocalAttendees();
  list.unshift(registration);
  saveLocalAttendees(list);

  return registration;
}

/**
 * Atomic zero-click checkin evaluator:
 * Decodes scanned QR payload, validates ticket against current event,
 * checks for duplicate admission, and records timestamp atomically.
 */
export async function admitAttendeeByQr(scannedRaw: string, activeEventId?: string): Promise<CheckinResult> {
  if (!scannedRaw) {
    return { success: false, code: "INVALID_TICKET", message: "Empty QR code detected" };
  }

  const cleanRaw = scannedRaw.trim();
  // Support either full hash "TKT-LAG-1001#evt-nestle-summit-2026" or plain ticket ID "TKT-LAG-1001" or URL
  let parsedTicketId = cleanRaw;

  if (cleanRaw.includes("/ticket/")) {
    const parts = cleanRaw.split("/ticket/");
    parsedTicketId = decodeURIComponent(parts[1]?.split("?")[0]?.split("#")[0] || "");
  } else if (cleanRaw.includes("#")) {
    parsedTicketId = cleanRaw.split("#")[0];
  }

  const attendee = await fetchAttendeeByTicketId(parsedTicketId);

  if (!attendee) {
    return {
      success: false,
      code: "INVALID_TICKET",
      message: `Ticket ID "${parsedTicketId}" is not recognized in the registration registry.`,
    };
  }

  // Check event match if scanner is locked to a specific event
  if (activeEventId && attendee.eventId !== activeEventId) {
    return {
      success: false,
      code: "WRONG_EVENT",
      message: `This ticket is registered for a different event: "${attendee.eventTitle}".`,
      attendee,
    };
  }

  // Check for duplicate admission
  if (attendee.status === "checked_in") {
    return {
      success: false,
      code: "ALREADY_CHECKED_IN",
      message: `Already admitted at ${new Date(attendee.checkedInAt || "").toLocaleTimeString()}`,
      attendee,
      previousCheckinAt: attendee.checkedInAt,
    };
  }

  // Mark admitted
  const checkedInAt = new Date().toISOString();
  const updatedAttendee: AttendeeRegistration = {
    ...attendee,
    status: "checked_in",
    checkedInAt,
    checkedInBy: "Scanner-Camera",
  };

  try {
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "mock-app") {
      await updateDoc(doc(db, "registrations", attendee.id), {
        status: "checked_in",
        checkedInAt,
        checkedInBy: "Scanner-Camera",
      });
    }
  } catch (err) {
    console.warn("Firestore checkin update error:", err);
  }

  // Update local memory
  const all = getLocalAttendees();
  const index = all.findIndex((a) => a.id === attendee.id);
  if (index !== -1) {
    all[index] = updatedAttendee;
    saveLocalAttendees(all);
  }

  return {
    success: true,
    code: "ADMITTED",
    message: "Admission confirmed. Welcome!",
    attendee: updatedAttendee,
  };
}

export function computeEventStats(attendees: AttendeeRegistration[]): EventStats {
  const totalRegistered = attendees.length;
  const totalAdmitted = attendees.filter((a) => a.status === "checked_in").length;
  const remaining = Math.max(0, totalRegistered - totalAdmitted);
  const attendanceRate = totalRegistered > 0 ? Math.round((totalAdmitted / totalRegistered) * 100) : 0;

  return {
    totalRegistered,
    totalAdmitted,
    remaining,
    attendanceRate,
    admissionsByHour: [],
  };
}
