"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  Clock,
  PlusCircle,
  Download,
  Search,
  CheckCircle2,
  ScanLine,
  Mail,
  Calendar,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Lock,
  LogOut,
  KeyRound,
  Radio,
} from "lucide-react";
import { EventItem, AttendeeRegistration } from "@/lib/types";
import {
  computeEventStats,
  INITIAL_EVENTS,
  INITIAL_ATTENDEES,
} from "@/lib/constants";
import { validateCreateEventPayload, sanitizeCsvCell } from "@/lib/validation";
import { EmailQueueView } from "./EmailQueueView";

interface AdminDashboardViewProps {
  initialEvent?: EventItem | null;
  lockedMode?: boolean;
  targetSlug?: string;
  sessionInfo?: {
    role: string;
    secondsRemaining?: number;
    onLock?: () => void;
    onReverify?: () => void;
  };
}

export function AdminDashboardView({
  initialEvent,
  lockedMode = false,
  targetSlug,
  sessionInfo,
}: AdminDashboardViewProps) {
  const [events, setEvents] = useState<EventItem[]>(
    initialEvent ? [initialEvent] : INITIAL_EVENTS
  );
  const [selectedEventId, setSelectedEventId] = useState<string>(
    initialEvent?.id || INITIAL_EVENTS[0].id
  );
  const [attendees, setAttendees] = useState<AttendeeRegistration[]>(INITIAL_ATTENDEES);
  const [isLoading, setIsLoading] = useState(false);

  // Active View Tab
  const [activeTab, setActiveTab] = useState<"attendees" | "email-queue">("attendees");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CHECKED_IN" | "PENDING">("ALL");
  const [tierFilter, setTierFilter] = useState<string>("ALL");

  // Create Event Modal state (for Super-Admin)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventOrganizer, setNewEventOrganizer] = useState("");
  const [newEventVenue, setNewEventVenue] = useState("");
  const [newEventAddress, setNewEventAddress] = useState("");
  const [newEventCity, setNewEventCity] = useState("Lagos");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventCapacity, setNewEventCapacity] = useState("500");
  const [newEventCategory, setNewEventCategory] = useState("Brand Activation");
  const [newEventAdminEmail, setNewEventAdminEmail] = useState("");
  const [newEventAdminPassword, setNewEventAdminPassword] = useState("admin123");
  const [newEventUsherPin, setNewEventUsherPin] = useState("0000");
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [createEventError, setCreateEventError] = useState<string | null>(null);

  const [copiedRegLink, setCopiedRegLink] = useState(false);
  const [copiedScanLink, setCopiedScanLink] = useState(false);

  // Live Multi-Terminal Polling State (7-second interval)
  const [isLivePolling, setIsLivePolling] = useState(true);
  const [lastPolledTime, setLastPolledTime] = useState<string | null>(null);
  const [admittingTicketId, setAdmittingTicketId] = useState<string | null>(null);

  const activeEvent =
    (initialEvent && lockedMode)
      ? initialEvent
      : events.find((e) => e.id === selectedEventId) || initialEvent || events[0] || INITIAL_EVENTS[0];

  const handleCopyRegistrationLink = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/e/${activeEvent.slug || activeEvent.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedRegLink(true);
      setTimeout(() => setCopiedRegLink(false), 2200);
    }
  };

  const handleCopyScannerLink = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/e/${activeEvent.slug || activeEvent.id}/scan`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedScanLink(true);
      setTimeout(() => setCopiedScanLink(false), 2200);
    }
  };

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        let targetId =
          initialEvent && lockedMode ? initialEvent.id : selectedEventId;

        if (!initialEvent || !lockedMode) {
          const evtsRes = await fetch("/api/events", { cache: "no-store" });
          if (evtsRes.ok) {
            const evtsData = await evtsRes.json();
            const evts: EventItem[] = Array.isArray(evtsData.events)
              ? evtsData.events
              : [];
            if (evts.length > 0) {
              setEvents(evts);
              if (targetSlug) {
                const match = evts.find(
                  (e) => e.slug === targetSlug || e.id === targetSlug
                );
                if (match) {
                  targetId = match.id;
                  setSelectedEventId(match.id);
                }
              } else if (!evts.find((e) => e.id === selectedEventId)) {
                targetId = evts[0].id;
                setSelectedEventId(evts[0].id);
              }
            }
          }
        }

        const attsRes = await fetch(
          `/api/attendees?eventId=${encodeURIComponent(targetId)}`,
          { cache: "no-store" }
        );
        if (attsRes.ok) {
          const attsData = await attsRes.json();
          if (Array.isArray(attsData.attendees)) {
            setAttendees(attsData.attendees);
            setLastPolledTime(
              new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            );
          }
        }
      } catch (err) {
        console.warn("Failed to load admin data via API:", err);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [initialEvent, lockedMode, selectedEventId, targetSlug]
  );

  // Initial load on selection change
  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // 7-Second Live Multi-Terminal Polling
  useEffect(() => {
    if (!isLivePolling) return;
    const pollInterval = setInterval(() => {
      loadData(true);
    }, 7000);
    return () => clearInterval(pollInterval);
  }, [isLivePolling, loadData]);

  // 1-Click Admin Check-In via /api/admit
  const handleAdminCheckIn = async (ticketId: string) => {
    if (admittingTicketId) return;
    setAdmittingTicketId(ticketId);
    try {
      const res = await fetch("/api/admit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrData: ticketId,
          eventId: activeEvent.id,
          terminalId: "Admin-Desk",
        }),
      });
      if (res.ok) {
        await loadData(true);
      }
    } catch (err) {
      console.error("Admin check-in via API failed:", err);
    } finally {
      setAdmittingTicketId(null);
    }
  };

  const stats = useMemo(() => computeEventStats(attendees), [attendees]);

  const filteredAttendees = useMemo(() => {
    return attendees.filter((a) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        a.fullName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.organization && a.organization.toLowerCase().includes(q));

      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "CHECKED_IN" && a.status === "checked_in") ||
        (statusFilter === "PENDING" && a.status === "registered");

      const matchTier = tierFilter === "ALL" || a.ticketType === tierFilter;

      return matchQuery && matchStatus && matchTier;
    });
  }, [attendees, searchQuery, statusFilter, tierFilter]);

  const handleExportCsv = () => {
    if (attendees.length === 0) return;

    const headers = [
      "Ticket ID",
      "Full Name",
      "Email",
      "Phone",
      "Organization",
      "Job Title",
      "Tier",
      "Status",
      "Registered At",
      "Admitted At",
    ];
    const rows = filteredAttendees.map((a) => [
      sanitizeCsvCell(a.id),
      `"${sanitizeCsvCell(a.fullName).replace(/"/g, '""')}"`,
      sanitizeCsvCell(a.email),
      sanitizeCsvCell(a.phone),
      `"${sanitizeCsvCell(a.organization || "").replace(/"/g, '""')}"`,
      `"${sanitizeCsvCell(a.jobTitle || "").replace(/"/g, '""')}"`,
      sanitizeCsvCell(a.ticketType),
      sanitizeCsvCell(a.status),
      sanitizeCsvCell(a.registeredAt),
      sanitizeCsvCell(a.checkedInAt || ""),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `attendees_${activeEvent.slug || "event"}_${Date.now()}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateEventError(null);

    const computedSlug = newEventTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const validation = validateCreateEventPayload({
      title: newEventTitle,
      slug: computedSlug,
      organizer: newEventOrganizer || "Innovcity Activations",
      category: newEventCategory,
      venueName: newEventVenue,
      venueAddress: newEventAddress,
      city: newEventCity,
      startDate: newEventDate,
      capacity: Number(newEventCapacity) || 500,
      adminEmail: (newEventAdminEmail || `admin@${computedSlug || "event"}.com`)
        .trim()
        .toLowerCase(),
      adminPassword: newEventAdminPassword || "admin123",
      usherPin: newEventUsherPin || "0000",
    });

    if (!validation.valid || !validation.data) {
      setCreateEventError(validation.error || "Please check event fields.");
      return;
    }

    setIsCreatingEvent(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateEventError(data.error || "Failed to create event.");
        return;
      }

      if (data.event) {
        setEvents((prev) => [data.event, ...prev]);
        setSelectedEventId(data.event.id);
        setShowCreateModal(false);
        setNewEventTitle("");
        setNewEventVenue("");
        setNewEventAddress("");
        setNewEventDate("");
        setNewEventAdminEmail("");
        setNewEventAdminPassword("admin123");
      }
    } catch (err) {
      console.error("Create event failed:", err);
      setCreateEventError("Could not connect to server to create event.");
    } finally {
      setIsCreatingEvent(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* 1-Minute Session Security Bar */}
      {sessionInfo && (
        <div className="p-3 bg-blue-50/90 border border-blue-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-slate-800">
              Authenticated {sessionInfo.role.toUpperCase()}
            </span>
            <span className="text-slate-400">&bull;</span>
            <span className="text-slate-600 font-medium flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              PIN re-verify in:{" "}
              <strong className="text-blue-700">
                {sessionInfo.secondsRemaining !== undefined
                  ? `${Math.floor(sessionInfo.secondsRemaining / 60)}m ${sessionInfo.secondsRemaining % 60}s`
                  : "30m 0s"}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {sessionInfo.onReverify && (
              <button
                type="button"
                onClick={sessionInfo.onReverify}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-[11px] border border-slate-200 transition-colors flex items-center gap-1"
              >
                <KeyRound className="w-3 h-3 text-blue-600" />
                <span>Verify Now</span>
              </button>
            )}
            {sessionInfo.onLock && (
              <button
                type="button"
                onClick={sessionInfo.onLock}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 font-bold text-[11px] border border-slate-200 transition-colors flex items-center gap-1"
              >
                <LogOut className="w-3 h-3" />
                <span>Lock</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">
              {lockedMode ? "Event Operations Portal" : "Platform Super-Admin"}
            </span>
            {lockedMode && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                Locked to {activeEvent.title}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-0.5">
            Event Registry &amp; Attendees
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time admission metrics, attendee registry, and gate terminal management.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={lockedMode ? `/e/${activeEvent.slug || activeEvent.id}/scan` : "/scan"}
            className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-sm"
          >
            <ScanLine className="w-4 h-4" />
            <span>Open Gate Scanner</span>
          </Link>

          {!lockedMode && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all border border-slate-200"
            >
              <PlusCircle className="w-4 h-4 text-slate-600" />
              <span>Create New Event</span>
            </button>
          )}
        </div>
      </div>

      {/* Event Switcher Bar & Dedicated Links */}
      <div className="light-card p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <div className="text-xs text-slate-500 font-medium">Selected Event:</div>
              <div className="text-sm font-bold text-slate-900">{activeEvent.title}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live Multi-Terminal Polling Toggle */}
            <button
              type="button"
              onClick={() => setIsLivePolling((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold transition-colors ${
                isLivePolling
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-slate-50 border-slate-200 text-slate-500"
              }`}
              title={
                isLivePolling
                  ? "Auto-polling gate check-ins every 7 seconds (Click to pause)"
                  : "Live polling paused (Click to resume)"
              }
            >
              <Radio
                className={`w-3.5 h-3.5 ${
                  isLivePolling ? "text-emerald-600 animate-pulse" : "text-slate-400"
                }`}
              />
              <span>{isLivePolling ? "LIVE SYNC (7s)" : "POLLING PAUSED"}</span>
              {lastPolledTime && isLivePolling && (
                <span className="font-mono text-[10px] text-emerald-600 hidden sm:inline">
                  &bull; {lastPolledTime}
                </span>
              )}
            </button>

            {!lockedMode ? (
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="bg-white border border-slate-200 text-slate-900 text-xs font-semibold rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.title} ({evt.city})
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 font-bold text-xs">
                {activeEvent.city}
              </div>
            )}

            <button
              onClick={() => loadData(false)}
              disabled={isLoading}
              className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition-colors"
              title="Refresh Data via API"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Dedicated Closed Links Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-700 inline-flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-blue-600" />
              Event Links:
            </span>
            <span className="font-mono bg-slate-100 text-blue-700 px-2.5 py-1 rounded-lg border border-slate-200/80 font-bold">
              /e/{activeEvent.slug || activeEvent.id}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyRegistrationLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold transition-colors border border-blue-200/60"
            >
              {copiedRegLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Copied Attendee Link!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Attendee Link</span>
                </>
              )}
            </button>

            <a
              href={`/e/${activeEvent.slug || activeEvent.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-semibold transition-colors border border-slate-200"
            >
              <span>Open Registration</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <button
              type="button"
              onClick={handleCopyScannerLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors border border-slate-200"
            >
              {copiedScanLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Copied Scanner Link!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Gate Scanner Link</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="light-card p-5 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase">
            <span>Total Registered</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            {stats.totalRegistered}
          </div>
          <div className="text-[11px] text-slate-400">
            Venue Capacity: {activeEvent.capacity || 500}
          </div>
        </div>

        <div className="light-card p-5 rounded-2xl space-y-1 bg-emerald-50/50 border-emerald-200">
          <div className="flex items-center justify-between text-xs text-emerald-700 font-semibold uppercase">
            <span>Admitted</span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600">
            {stats.totalAdmitted}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium">
            Scanned through gate
          </div>
        </div>

        <div className="light-card p-5 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase">
            <span>Pending Arrival</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            {stats.remaining}
          </div>
          <div className="text-[11px] text-slate-400">Awaiting QR scan</div>
        </div>

        <div className="light-card p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase">
            <span>Turnout Rate</span>
            <span className="font-bold text-blue-600">{stats.attendanceRate}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${stats.attendanceRate}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400">
            {stats.totalAdmitted} of {stats.totalRegistered} checked in
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("attendees")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "attendees"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Attendee Registry ({attendees.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("email-queue")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "email-queue"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Resend Email &amp; Queue</span>
        </button>
      </div>

      {activeTab === "email-queue" ? (
        <EmailQueueView />
      ) : (
        /* Registry Controls & Table */
        <div className="light-card rounded-2xl overflow-hidden border border-slate-200 space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, company, or ticket code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              {(["ALL", "CHECKED_IN", "PENDING"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    statusFilter === s
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {s === "ALL" ? "All" : s === "CHECKED_IN" ? "Admitted" : "Pending"}
                </button>
              ))}
            </div>

            {/* Tier Filter */}
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="ALL">All Tiers</option>
              <option value="General Admission">General Admission</option>
              <option value="VIP">VIP</option>
              <option value="Speaker">Speaker</option>
              <option value="Exhibitor">Exhibitor</option>
            </select>

            {/* 1-Click Export CSV */}
            <button
              onClick={handleExportCsv}
              disabled={filteredAttendees.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Attendee Roster Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Ticket ID</th>
                <th className="py-3 px-4">Attendee</th>
                <th className="py-3 px-4">Organization</th>
                <th className="py-3 px-4">Pass Tier</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredAttendees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No attendees found matching filter.
                  </td>
                </tr>
              ) : (
                filteredAttendees.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-blue-700">
                      {att.id}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{att.fullName}</div>
                      <div className="text-[11px] text-slate-400">{att.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div>{att.organization || "—"}</div>
                      <div className="text-[11px] text-slate-400">{att.jobTitle || ""}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                        {att.ticketType}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {att.status === "checked_in" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Admitted</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold text-[10px]">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-slate-400">
                      {att.checkedInAt
                        ? `Admitted at ${new Date(att.checkedInAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : `Registered on ${new Date(att.registeredAt).toLocaleDateString()}`}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {att.status !== "checked_in" && (
                          <button
                            type="button"
                            onClick={() => handleAdminCheckIn(att.id)}
                            disabled={admittingTicketId === att.id}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors disabled:opacity-50"
                            title="Admit attendee via /api/admit"
                          >
                            {admittingTicketId === att.id ? "Admitting..." : "Check In"}
                          </button>
                        )}
                        <a
                          href={`/ticket/${att.id}`}
                          target="_blank"
                          className="text-blue-600 hover:text-blue-800 font-bold text-xs inline-flex items-center gap-1"
                        >
                          <span>Pass</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Modal: Create Event (Super-Admin) */}
      {showCreateModal && !lockedMode && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl border border-slate-200 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span>Create New Event</span>
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xs px-2.5 py-1 rounded-lg bg-slate-100"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-3 text-xs">
              {createEventError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-medium text-xs">
                  {createEventError}
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold uppercase mb-1">
                  Event Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual Brand Activator Kickoff 2026"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Lock className="w-3 h-3 text-blue-600 shrink-0" />
                  <span>Dedicated Closed Link:</span>
                  <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-semibold truncate">
                    /e/
                    {newEventTitle
                      ? newEventTitle
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/(^-|-$)/g, "")
                      : "your-event-slug"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold uppercase mb-1">
                    Organizer
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Nestlé Nigeria"
                    value={newEventOrganizer}
                    onChange={(e) => setNewEventOrganizer(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold uppercase mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={newEventCategory}
                    onChange={(e) => setNewEventCategory(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold uppercase mb-1">
                  Venue Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Landmark Centre Hall 2"
                  value={newEventVenue}
                  onChange={(e) => setNewEventVenue(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold uppercase mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Water Corporation Drive"
                    value={newEventAddress}
                    onChange={(e) => setNewEventAddress(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold uppercase mb-1">
                    City / State
                  </label>
                  <input
                    type="text"
                    value={newEventCity}
                    onChange={(e) => setNewEventCity(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold uppercase mb-1">
                    Date &amp; Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold uppercase mb-1">
                    Capacity (Seats)
                  </label>
                  <input
                    type="number"
                    value={newEventCapacity}
                    onChange={(e) => setNewEventCapacity(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Security Credentials (PBKDF2 Hashed) */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-slate-700 font-semibold uppercase mb-1">
                    Event Admin Email
                  </label>
                  <input
                    type="email"
                    placeholder="admin@brand.com"
                    value={newEventAdminEmail}
                    onChange={(e) => setNewEventAdminEmail(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400">
                    For /e/[slug]/admin (Defaults to admin@[slug].com if blank)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold uppercase mb-1">
                      Event Admin Password
                    </label>
                    <input
                      type="password"
                      placeholder="admin123"
                      value={newEventAdminPassword}
                      onChange={(e) => setNewEventAdminPassword(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400">Stored as salted PBKDF2 hash</span>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold uppercase mb-1">
                      Gate Usher PIN
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="0000"
                      value={newEventUsherPin}
                      onChange={(e) => setNewEventUsherPin(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono text-center font-bold tracking-wider focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400">For /e/[slug]/scan</span>
                  </div>
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={isCreatingEvent}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {isCreatingEvent ? "Publishing Event..." : "Publish Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
