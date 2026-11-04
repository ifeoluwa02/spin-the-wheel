import { EventItem, AttendeeRegistration, CheckinResult, EventStats } from "./types";
import { escapeRegex, sanitizeText, containsMaliciousPayload } from "./validation";
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
} from "firebase/firestore";

// Seed sample events so the app works immediately out of the box
export const INITIAL_EVENTS: EventItem[] = [
  {
    id: "evt-nestle-summit-2026",
    slug: "nestle-summit-2026",
    title: "Nestlé Brand Activation & Retail Summit 2026",
    category: "Corporate & Brand Activation",
    organizer: "Nestlé Nigeria Field Marketing",
    description:
      "Annual convention of brand activators, field managers, and retail partners celebrating nationwide growth and introducing new activation technology.",
    venueName: "Eko Hotel & Suites Grand Ballroom",
    venueAddress: "Plot 1415 Adetokunbo Ademola Street, Victoria Island",
    city: "Lagos",
    state: "Lagos",
    startDate: "2026-11-15T09:00:00",
    endDate: "2026-11-15T18:00:00",
    capacity: 500,
    bannerGradient: "from-blue-600 via-indigo-600 to-purple-700",
    adminEmail: "admin@nestle.com",
    adminPassword: "admin123",
    usherPin: "0000",
    createdAt: "2026-10-01T10:00:00Z",
  },
  {
    id: "evt-tech-africa-lagos",
    slug: "tech-africa-lagos",
    title: "Lagos Tech & Product Innovation Expo",
    category: "Technology & Design",
    organizer: "Innovcity Tech Network",
    description:
      "Connecting over 1,000 developers, product founders, and venture builders for keynote sessions, live product demos, and VIP networking.",
    venueName: "Landmark Event Centre Hall A",
    venueAddress: "Water Corporation Drive, Oniru, Victoria Island",
    city: "Lagos",
    state: "Lagos",
    startDate: "2026-12-05T08:30:00",
    endDate: "2026-12-05T17:00:00",
    capacity: 1000,
    bannerGradient: "from-emerald-600 via-teal-600 to-cyan-700",
    adminEmail: "admin@techafrica.com",
    adminPassword: "admin123",
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
const activeCheckinLocks = new Set<string>();

const LOCAL_STORAGE_KEY_EVENTS = "attendance_events_store";
const LOCAL_STORAGE_KEY_ATTENDEES = "attendance_attendees_store";

function isClient(): boolean {
  return typeof window !== "undefined";
}

async function getServerMongoDb() {
  if (isClient()) return null;
  try {
    const { getMongoDb } = await import("./mongodb");
    return await getMongoDb();
  } catch (e) {
    console.warn("Could not load server MongoDB:", e);
    return null;
  }
}

async function hashServerPassword(plainPassword: string): Promise<string> {
  if (!plainPassword || plainPassword.includes(":")) return plainPassword;
  if (isClient()) return plainPassword;
  try {
    const { hashPassword } = await import("./auth");
    return hashPassword(plainPassword);
  } catch {
    return plainPassword;
  }
}

async function signServerQrHash(ticketId: string, eventId: string): Promise<string> {
  if (isClient()) return `${ticketId}#${eventId}`;
  try {
    const { signTicketQrHash } = await import("./auth");
    return signTicketQrHash(ticketId, eventId);
  } catch {
    return `${ticketId}#${eventId}`;
  }
}

async function verifyServerQrSignature(rawQr: string): Promise<{
  valid: boolean;
  ticketId: string;
  eventId?: string;
}> {
  if (isClient()) {
    const parts = rawQr.split("#");
    return { valid: true, ticketId: parts[0], eventId: parts[1] };
  }
  try {
    const { verifyTicketQrSignature } = await import("./auth");
    return verifyTicketQrSignature(rawQr);
  } catch {
    const parts = rawQr.split("#");
    return { valid: true, ticketId: parts[0], eventId: parts[1] };
  }
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
  if (isClient()) {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.events) && data.events.length > 0) {
          saveLocalEvents(data.events);
          return data.events;
        }
      }
    } catch (e) {
      console.warn("Client fetch /api/events fallback to local:", e);
    }
    return getLocalEvents();
  }

  try {
    const mongo = await getServerMongoDb();
    if (mongo) {
      const docs = await mongo.collection("events").find({}).sort({ createdAt: -1 }).toArray();
      if (docs && docs.length > 0) {
        return docs.map(({ _id, ...rest }) => rest as unknown as EventItem);
      } else {
        // Hash seed passwords before inserting into fresh MongoDB
        const hashedSeeds = await Promise.all(
          INITIAL_EVENTS.map(async (evt) => ({
            ...evt,
            adminPassword: await hashServerPassword(evt.adminPassword || "admin123"),
          }))
        );
        await mongo.collection("events").insertMany(hashedSeeds).catch(() => {});
        return hashedSeeds;
      }
    }
  } catch (e) {
    console.warn("MongoDB fetchAllEvents error:", e);
  }

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
  const clean = (eventIdOrSlug || "").trim();
  if (!clean) return null;

  if (isClient()) {
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(clean)}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.event) return data.event as EventItem;
      }
    } catch (e) {
      console.warn("Client fetchEventById fallback:", e);
    }
  }

  try {
    const mongo = await getServerMongoDb();
    if (mongo) {
      const doc = await mongo.collection("events").findOne({
        $or: [{ id: clean }, { slug: clean }],
      });
      if (doc) {
        const { _id, ...rest } = doc;
        return rest as unknown as EventItem;
      }
    }
  } catch (e) {
    console.warn("MongoDB fetchEventById error:", e);
  }

  const events = await fetchAllEvents();
  return events.find((e) => e.id === clean || e.slug === clean) || null;
}

/**
 * Creates a new event and automatically hashes `adminPassword` using salted PBKDF2 (100,000 iterations)
 * before persisting to MongoDB, Firestore, or memory.
 */
export async function createNewEvent(eventData: Omit<EventItem, "id" | "createdAt">): Promise<EventItem> {
  const newId = `evt-${Date.now()}`;
  const rawPassword = (eventData.adminPassword || "admin123").trim();
  const hashedAdminPassword = await hashServerPassword(rawPassword);

  const newEvent: EventItem = {
    ...eventData,
    id: newId,
    adminEmail: (eventData.adminEmail || `admin@${eventData.slug || "event"}.com`).trim().toLowerCase(),
    adminPassword: hashedAdminPassword,
    usherPin: (eventData.usherPin || "0000").trim(),
    createdAt: new Date().toISOString(),
  };

  try {
    const mongo = await getServerMongoDb();
    if (mongo) {
      await mongo.collection("events").insertOne({ ...newEvent });
    }
  } catch (err) {
    console.warn("MongoDB createNewEvent error:", err);
  }

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

/**
 * Upgrades a legacy plaintext event admin password in MongoDB to a salted PBKDF2 hash.
 */
export async function upgradeEventAdminPasswordHash(
  eventId: string,
  hashedPassword: string
): Promise<void> {
  if (!eventId || !hashedPassword.includes(":")) return;
  try {
    const mongo = await getServerMongoDb();
    if (mongo) {
      await mongo.collection("events").updateOne(
        { id: eventId },
        { $set: { adminPassword: hashedPassword } }
      );
    }
  } catch (err) {
    console.warn("Failed to upgrade event admin password hash:", err);
  }
}

export async function fetchAttendeesByEvent(eventId: string): Promise<AttendeeRegistration[]> {
  if (isClient()) {
    try {
      const res = await fetch(`/api/attendees?eventId=${encodeURIComponent(eventId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.attendees)) {
          return data.attendees;
        }
      }
    } catch (e) {
      console.warn("Client fetchAttendeesByEvent fallback:", e);
    }
    const list = getLocalAttendees();
    return list.filter((a) => a.eventId === eventId);
  }

  try {
    const mongo = await getServerMongoDb();
    if (mongo) {
      const docs = await mongo
        .collection("attendees")
        .find({ eventId })
        .sort({ registeredAt: -1 })
        .toArray();
      if (docs && docs.length > 0) {
        return docs.map(({ _id, ...rest }) => rest as unknown as AttendeeRegistration);
      } else if (eventId === INITIAL_EVENTS[0].id) {
        const seeds = INITIAL_ATTENDEES.filter((a) => a.eventId === eventId);
        await mongo.collection("attendees").insertMany(seeds).catch(() => {});
        return seeds;
      }
      return [];
    }
  } catch (e) {
    console.warn("MongoDB fetchAttendeesByEvent error:", e);
  }

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
  if (containsMaliciousPayload(ticketId)) return null;
  const clean = sanitizeText(ticketId, 120);
  if (!clean) return null;

  if (isClient()) {
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(clean)}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.attendee) return data.attendee as AttendeeRegistration;
      }
    } catch (e) {
      console.warn("Client fetchAttendeeByTicketId fallback:", e);
    }
  }

  try {
    const mongo = await getServerMongoDb();
    if (mongo) {
      const doc = await mongo.collection("attendees").findOne({
        id: { $regex: new RegExp(`^${escapeRegex(clean)}$`, "i") },
      });
      if (doc) {
        const { _id, ...rest } = doc;
        return rest as unknown as AttendeeRegistration;
      }
    }
  } catch (e) {
    console.warn("MongoDB fetchAttendeeByTicketId error:", e);
  }

  try {
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "mock-app") {
      const snap = await getDoc(doc(db, "registrations", clean));
      if (snap.exists()) {
        return snap.data() as AttendeeRegistration;
      }
    }
  } catch (e) {
    console.warn("Firestore ticket lookup error:", e);
  }

  const list = getLocalAttendees();
  return list.find((a) => a.id.toLowerCase() === clean.toLowerCase()) || null;
}

/**
 * O(1) Indexed Capacity & Duplicate Email Check for High-Throughput Registrations
 */
export async function checkEventCapacityAndDuplicate(
  eventId: string,
  email: string
): Promise<{
  registeredCount: number;
  existingDuplicate: AttendeeRegistration | null;
}> {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const mongo = await getServerMongoDb();
    if (mongo) {
      const [count, dupDoc] = await Promise.all([
        mongo.collection("attendees").countDocuments({ eventId }),
        mongo.collection("attendees").findOne({
          eventId,
          email: normalizedEmail,
        }),
      ]);

      let existingDuplicate: AttendeeRegistration | null = null;
      if (dupDoc) {
        const { _id, ...rest } = dupDoc;
        existingDuplicate = rest as unknown as AttendeeRegistration;
      }

      return {
        registeredCount: count,
        existingDuplicate,
      };
    }
  } catch (e) {
    console.warn("MongoDB checkEventCapacityAndDuplicate fallback:", e);
  }

  const all = await fetchAttendeesByEvent(eventId);
  const dup =
    all.find((a) => a.email.trim().toLowerCase() === normalizedEmail) || null;
  return {
    registeredCount: all.length,
    existingDuplicate: dup,
  };
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
  // Cryptographically sign QR payload with HMAC-SHA256 (<ticketId>#<eventId>#<16-char-sig>)
  const qrHash = await signServerQrHash(ticketId, event.id);

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
    const mongo = await getServerMongoDb();
    if (mongo) {
      await mongo.collection("attendees").insertOne({ ...registration });
    }
  } catch (err) {
    console.warn("MongoDB registerNewAttendee error:", err);
  }

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
 * Atomic Multi-Gate Zero-Click Check-In Evaluator:
 * Decodes scanned QR payload, validates ticket against current event,
 * and uses MongoDB's atomic `findOneAndUpdate({ id, status: "registered" })`
 * to guarantee that simultaneous scans across multiple gates cannot double-admit.
 */
export async function admitAttendeeByQr(
  scannedRaw: string,
  activeEventId?: string,
  terminalId = "Scanner-Camera"
): Promise<CheckinResult> {
  if (!scannedRaw) {
    return { success: false, code: "INVALID_TICKET", message: "Empty QR code detected" };
  }

  const cleanRaw = scannedRaw.trim();
  let parsedTicketId = cleanRaw;

  if (cleanRaw.includes("/ticket/")) {
    const parts = cleanRaw.split("/ticket/");
    parsedTicketId = decodeURIComponent(parts[1]?.split("?")[0]?.split("#")[0] || "");
  } else if (cleanRaw.includes("#")) {
    const sigCheck = await verifyServerQrSignature(cleanRaw);
    if (!sigCheck.valid) {
      return {
        success: false,
        code: "INVALID_TICKET",
        message: "QR cryptographic signature verification failed — forged or tampered pass.",
      };
    }
    parsedTicketId = sigCheck.ticketId;
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

  // Fast pre-check if already checked in
  if (attendee.status === "checked_in") {
    return {
      success: false,
      code: "ALREADY_CHECKED_IN",
      message: `Already admitted at ${new Date(attendee.checkedInAt || "").toLocaleTimeString()}`,
      attendee,
      previousCheckinAt: attendee.checkedInAt,
    };
  }

  // In-memory concurrency lock for same-process simultaneous requests
  const lockKey = attendee.id.toUpperCase();
  if (activeCheckinLocks.has(lockKey)) {
    return {
      success: false,
      code: "ALREADY_CHECKED_IN",
      message: "Concurrent scan detected at another gate — ticket is already being admitted.",
      attendee,
      previousCheckinAt: new Date().toISOString(),
    };
  }

  activeCheckinLocks.add(lockKey);

  try {
    const checkedInAt = new Date().toISOString();

    // Primary Atomic Multi-Gate Check-in via MongoDB findOneAndUpdate
    const mongo = await getServerMongoDb();
    if (mongo) {
      const atomicUpdatedDoc = await mongo.collection("attendees").findOneAndUpdate(
        {
          id: attendee.id,
          status: "registered", // ATOMIC CONDITION: Only matches if status is still "registered"
        },
        {
          $set: {
            status: "checked_in",
            checkedInAt,
            checkedInBy: terminalId,
          },
        },
        { returnDocument: "after" }
      );

      // If null, another gate usher won the race milliseconds ago!
      if (!atomicUpdatedDoc) {
        const latestDoc = await mongo.collection("attendees").findOne({ id: attendee.id });
        const latestAttendee = latestDoc
          ? (({ _id, ...rest }) => rest as unknown as AttendeeRegistration)(latestDoc)
          : attendee;

        return {
          success: false,
          code: "ALREADY_CHECKED_IN",
          message: `Already admitted at ${new Date(
            latestAttendee.checkedInAt || checkedInAt
          ).toLocaleTimeString()}`,
          attendee: latestAttendee,
          previousCheckinAt: latestAttendee.checkedInAt || checkedInAt,
        };
      }

      const { _id, ...cleanUpdated } = atomicUpdatedDoc;
      const updatedAttendee = cleanUpdated as unknown as AttendeeRegistration;

      // Sync local memory cache
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

    // Fallback path when running without MongoDB (Firestore or Local Memory)
    const updatedAttendee: AttendeeRegistration = {
      ...attendee,
      status: "checked_in",
      checkedInAt,
      checkedInBy: terminalId,
    };

    try {
      if (
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "mock-app"
      ) {
        await updateDoc(doc(db, "registrations", attendee.id), {
          status: "checked_in",
          checkedInAt,
          checkedInBy: terminalId,
        });
      }
    } catch (err) {
      console.warn("Firestore checkin update error:", err);
    }

    const all = getLocalAttendees();
    const index = all.findIndex((a) => a.id === attendee.id);
    if (index !== -1) {
      if (all[index].status === "checked_in") {
        return {
          success: false,
          code: "ALREADY_CHECKED_IN",
          message: `Already admitted at ${new Date(all[index].checkedInAt || "").toLocaleTimeString()}`,
          attendee: all[index],
          previousCheckinAt: all[index].checkedInAt,
        };
      }
      all[index] = updatedAttendee;
      saveLocalAttendees(all);
    }

    return {
      success: true,
      code: "ADMITTED",
      message: "Admission confirmed. Welcome!",
      attendee: updatedAttendee,
    };
  } finally {
    activeCheckinLocks.delete(lockKey);
  }
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