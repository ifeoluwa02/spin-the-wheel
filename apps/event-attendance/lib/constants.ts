import { EventItem, AttendeeRegistration, EventStats } from "./types";

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
