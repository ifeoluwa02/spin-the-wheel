"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  Clock,
  PlusCircle,
  Download,
  Search,
  Filter,
  CheckCircle2,
  ScanLine,
  Mail,
  Calendar,
  Building,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { EventItem, AttendeeRegistration } from "@/lib/types";
import {
  fetchAllEvents,
  fetchAttendeesByEvent,
  createNewEvent,
  computeEventStats,
  INITIAL_EVENTS,
  INITIAL_ATTENDEES,
} from "@/lib/repository";

export default function AdminDashboardPage() {
  const [events, setEvents] = useState<EventItem[]>(INITIAL_EVENTS);
  const [selectedEventId, setSelectedEventId] = useState<string>(INITIAL_EVENTS[0].id);
  const [attendees, setAttendees] = useState<AttendeeRegistration[]>(INITIAL_ATTENDEES);
  const [isLoading, setIsLoading] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CHECKED_IN" | "PENDING">("ALL");
  const [tierFilter, setTierFilter] = useState<string>("ALL");

  // Create Event Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventOrganizer, setNewEventOrganizer] = useState("");
  const [newEventVenue, setNewEventVenue] = useState("");
  const [newEventAddress, setNewEventAddress] = useState("");
  const [newEventCity, setNewEventCity] = useState("Lagos");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventCapacity, setNewEventCapacity] = useState("500");
  const [newEventCategory, setNewEventCategory] = useState("Brand Activation");
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const evts = await fetchAllEvents();
      setEvents(evts);
      if (evts.length > 0 && !evts.find((e) => e.id === selectedEventId)) {
        setSelectedEventId(evts[0].id);
      }
      const atts = await fetchAttendeesByEvent(selectedEventId);
      setAttendees(atts);
    } catch (err) {
      console.warn("Failed to load admin data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedEventId]);

  const activeEvent = events.find((e) => e.id === selectedEventId) || events[0];
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

    const headers = ["Ticket ID", "Full Name", "Email", "Phone", "Organization", "Job Title", "Tier", "Status", "Registered At", "Admitted At"];
    const rows = filteredAttendees.map((a) => [
      a.id,
      `"${a.fullName.replace(/"/g, '""')}"`,
      a.email,
      a.phone,
      `"${(a.organization || "").replace(/"/g, '""')}"`,
      `"${(a.jobTitle || "").replace(/"/g, '""')}"`,
      a.ticketType,
      a.status,
      a.registeredAt,
      a.checkedInAt || "",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendees_${activeEvent.slug || "event"}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle || !newEventVenue || !newEventDate) return;

    setIsCreatingEvent(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newEventTitle,
          organizer: newEventOrganizer || "Innovcity Activations",
          category: newEventCategory,
          venueName: newEventVenue,
          venueAddress: newEventAddress,
          city: newEventCity,
          startDate: new Date(newEventDate).toISOString(),
          capacity: Number(newEventCapacity) || 500,
        }),
      });

      const data = await res.json();
      if (res.ok && data.event) {
        setEvents((prev) => [data.event, ...prev]);
        setSelectedEventId(data.event.id);
        setShowCreateModal(false);
        setNewEventTitle("");
        setNewEventVenue("");
        setNewEventAddress("");
        setNewEventDate("");
      }
    } catch (err) {
      console.error("Create event failed:", err);
    } finally {
      setIsCreatingEvent(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">
              Operations Control
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Event Registry &amp; Attendees
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time admission metrics, attendee registry, and gate terminal management.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/scan"
            className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-sm"
          >
            <ScanLine className="w-4 h-4" />
            <span>Open Gate Scanner</span>
          </Link>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all border border-slate-200"
          >
            <PlusCircle className="w-4 h-4 text-slate-600" />
            <span>Create New Event</span>
          </button>
        </div>
      </div>

      {/* Event Switcher Bar */}
      <div className="light-card p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
          <div>
            <div className="text-xs text-slate-500 font-medium">Selected Event:</div>
            <div className="text-sm font-bold text-slate-900">{activeEvent.title}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
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
          <div className="text-[11px] text-slate-400">Gate conversion rate</div>
        </div>
      </div>

      {/* Registry Table */}
      <div className="light-card rounded-2xl overflow-hidden shadow-sm">
        {/* Table Filters & Search */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search by attendee name, email, or ticket ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | "CHECKED_IN" | "PENDING")}
              className="bg-white border border-slate-200 text-slate-900 text-xs font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="ALL">All Statuses ({attendees.length})</option>
              <option value="CHECKED_IN">Admitted ({stats.totalAdmitted})</option>
              <option value="PENDING">Pending ({stats.remaining})</option>
            </select>

            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-900 text-xs font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="ALL">All Tiers</option>
              <option value="General Admission">General Admission</option>
              <option value="VIP">VIP</option>
              <option value="Speaker">Speaker</option>
              <option value="Exhibitor">Exhibitor</option>
            </select>

            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-200 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100/75 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Ticket ID</th>
                <th className="py-3 px-4">Attendee Name</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Organization</th>
                <th className="py-3 px-4">Tier</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Admitted At</th>
                <th className="py-3 px-4 text-right">Pass</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredAttendees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No attendees match the current search filters.
                  </td>
                </tr>
              ) : (
                filteredAttendees.map((att) => {
                  const isCheckedIn = att.status === "checked_in";
                  return (
                    <tr key={att.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">
                        {att.id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{att.fullName}</div>
                        {att.jobTitle && <div className="text-[10px] text-slate-400">{att.jobTitle}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800">{att.email}</div>
                        <div className="text-[10px] text-slate-400">{att.phone || "—"}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {att.organization || "—"}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                          {att.ticketType}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {isCheckedIn ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Admitted</span>
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {isCheckedIn && att.checkedInAt
                          ? new Date(att.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/ticket/${att.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-semibold"
                        >
                          <span>Pass</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Event */}
      {showCreateModal && (
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

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isCreatingEvent}
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50"
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
