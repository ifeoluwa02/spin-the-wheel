"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import confetti from "canvas-confetti";
import {
  Calendar,
  MapPin,
  Clock,
  Ticket,
  Mail,
  User,
  Phone,
  Briefcase,
  Building,
  CheckCircle2,
  Sparkles,
  Download,
  ExternalLink,
  ChevronRight,
  Eye,
} from "lucide-react";
import { EventItem, AttendeeRegistration } from "@/lib/types";
import { INITIAL_EVENTS } from "@/lib/repository";

export default function RegisterPage() {
  const [events, setEvents] = useState<EventItem[]>(INITIAL_EVENTS);
  const [selectedEventId, setSelectedEventId] = useState<string>(INITIAL_EVENTS[0].id);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form inputs
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [ticketType, setTicketType] = useState<AttendeeRegistration["ticketType"]>("General Admission");

  // Registration Result
  const [registeredAttendee, setRegisteredAttendee] = useState<AttendeeRegistration | null>(null);
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);

  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch("/api/events");
        if (res.ok) {
          const data = await res.json();
          if (data.events && data.events.length > 0) {
            setEvents(data.events);
            setSelectedEventId(data.events[0].id);
          }
        }
      } catch (err) {
        console.warn("Using local initial events:", err);
      }
    }
    loadEvents();
  }, []);

  const activeEvent = events.find((e) => e.id === selectedEventId) || events[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email) {
      setErrorMsg("Please provide your full name and email address.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: activeEvent.id,
          fullName,
          email,
          phone,
          organization,
          jobTitle,
          ticketType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register for event");
      }

      setRegisteredAttendee(data.attendee);
      setEmailPreviewHtml(data.emailPreviewHtml || null);

      // Trigger celebration confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Event Selector pill bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Event Registration &amp; Pass</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
              Live Gateway
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Register to receive your unique admission QR code instantly via email and download.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Select Event:
          </label>
          <select
            value={selectedEventId}
            onChange={(e) => {
              setSelectedEventId(e.target.value);
              setRegisteredAttendee(null);
            }}
            className="bg-slate-900 border border-slate-700 text-white text-xs sm:text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>
                {evt.title} ({evt.city})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Event Overview Card */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
            {/* Gradient Banner */}
            <div className={`p-6 sm:p-8 bg-gradient-to-br ${activeEvent.bannerGradient || "from-indigo-600 to-purple-800"} text-white relative`}>
              <div className="inline-block bg-black/25 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
                {activeEvent.category}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black leading-tight mb-2">
                {activeEvent.title}
              </h2>
              <p className="text-xs sm:text-sm text-white/90">
                Organized by <span className="font-semibold">{activeEvent.organizer}</span>
              </p>
            </div>

            {/* Event Key Info */}
            <div className="p-6 space-y-4 text-sm">
              <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
                {activeEvent.description}
              </p>

              <div className="pt-4 border-t border-slate-800/80 space-y-3">
                <div className="flex items-start gap-3 text-slate-300">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Date</div>
                    <div className="text-xs text-slate-400">
                      {new Date(activeEvent.startDate).toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-slate-300">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Time</div>
                    <div className="text-xs text-slate-400">
                      {new Date(activeEvent.startDate).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      -{" "}
                      {new Date(activeEvent.endDate).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-slate-300">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">{activeEvent.venueName}</div>
                    <div className="text-xs text-slate-400">{activeEvent.venueAddress}, {activeEvent.city}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Form or Confirmation Pass */}
        <div className="lg:col-span-7">
          {!registeredAttendee ? (
            /* Registration Form */
            <div className="glass-card rounded-2xl p-6 sm:p-8 shadow-2xl border border-slate-800">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-indigo-400" />
                    <span>Claim Your Entry Pass</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Fill in your credentials to generate your zero-click admission QR badge.
                  </p>
                </div>
              </div>

              {errorMsg && (
                <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Full Name <span className="text-indigo-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Babatunde Adeleke"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Email Address <span className="text-indigo-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        placeholder="you@domain.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Phone Number
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="tel"
                        placeholder="080 1234 5678"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Organization / Company
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Building className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        placeholder="Company name"
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Job Title / Role
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. Field Supervisor"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Pass Category
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(["General Admission", "VIP", "Speaker", "Exhibitor"] as const).map((type) => (
                      <button
                        type="button"
                        key={type}
                        onClick={() => setTicketType(type)}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all text-center ${
                          ticketType === type
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-pink-600 hover:from-indigo-500 hover:to-pink-500 shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span>Generating Pass &amp; Sending Email...</span>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Confirm Registration &amp; Get QR Ticket</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Registration Success & Instant Digital Pass View */
            <div className="glass-card rounded-2xl p-6 sm:p-8 shadow-2xl border border-emerald-500/30">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 mb-6">
                <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-400" />
                <div>
                  <div className="font-bold text-sm">Registration Confirmed!</div>
                  <div className="text-xs text-emerald-400/90">
                    A confirmation email with your QR code has been prepared for <strong>{registeredAttendee.email}</strong>.
                  </div>
                </div>
              </div>

              {/* Physical / Digital Ticket Preview */}
              <div className="bg-slate-900 rounded-2xl border-2 border-dashed border-slate-700 p-6 text-center space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-3">
                  <span className="font-mono text-indigo-400 font-bold text-sm tracking-wider">
                    {registeredAttendee.id}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 font-semibold uppercase text-[10px] border border-indigo-500/30">
                    {registeredAttendee.ticketType}
                  </span>
                </div>

                {/* High Contrast QR Code */}
                <div className="bg-white p-4 rounded-xl inline-block shadow-xl">
                  <QRCodeSVG
                    value={registeredAttendee.qrHash || registeredAttendee.id}
                    size={220}
                    level="H"
                    includeMargin={false}
                  />
                </div>

                <div>
                  <div className="text-lg font-bold text-white">{registeredAttendee.fullName}</div>
                  <div className="text-xs text-slate-400">
                    {registeredAttendee.organization ? `${registeredAttendee.organization} • ` : ""}
                    {activeEvent.title}
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 uppercase tracking-widest font-mono">
                  Zero-Click Continuous Scanner Pass &bull; Scan at Entrance
                </p>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
                <a
                  href={`/ticket/${registeredAttendee.id}`}
                  target="_blank"
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-md shadow-indigo-600/30"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Mobile Pass</span>
                </a>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Print / PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowEmailModal(true)}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-all"
                >
                  <Eye className="w-4 h-4" />
                  <span>Preview Email</span>
                </button>
              </div>

              <div className="text-center pt-6">
                <button
                  type="button"
                  onClick={() => {
                    setRegisteredAttendee(null);
                    setFullName("");
                    setEmail("");
                    setPhone("");
                  }}
                  className="text-xs text-slate-400 hover:text-white underline underline-offset-4"
                >
                  &larr; Register another attendee
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Email Preview Modal */}
      {showEmailModal && emailPreviewHtml && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-sm text-white">Automated Branded Ticket Email</span>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2.5 py-1 rounded-lg bg-slate-800"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-950">
              <iframe
                title="Email Preview"
                srcDoc={emailPreviewHtml}
                className="w-full h-[600px] rounded-xl border border-slate-800 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
