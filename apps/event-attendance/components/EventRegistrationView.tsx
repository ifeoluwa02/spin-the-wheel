"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
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
  Building,
  CheckCircle2,
  Sparkles,
  Download,
  ExternalLink,
  Eye,
  ShieldCheck,
  Share2,
  Check,
  Copy,
  Lock,
} from "lucide-react";
import { EventItem, AttendeeRegistration } from "@/lib/types";
import { INITIAL_EVENTS } from "@/lib/repository";

interface EventRegistrationViewProps {
  initialEvent?: EventItem | null;
  initialEvents?: EventItem[];
  lockedMode?: boolean; // When true, no dropdown is shown and registration is locked strictly to this event
  targetSlug?: string;
}

export function EventRegistrationView({
  initialEvent,
  initialEvents,
  lockedMode = false,
  targetSlug,
}: EventRegistrationViewProps) {
  const [events, setEvents] = useState<EventItem[]>(
    initialEvents && initialEvents.length > 0 ? initialEvents : INITIAL_EVENTS
  );
  const [selectedEventId, setSelectedEventId] = useState<string>(
    initialEvent?.id || INITIAL_EVENTS[0].id
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form inputs
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
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
            if (!initialEvent) {
              if (targetSlug) {
                const match = data.events.find(
                  (e: EventItem) => e.slug === targetSlug || e.id === targetSlug
                );
                if (match) setSelectedEventId(match.id);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Using local events:", err);
      }
    }
    loadEvents();
  }, [initialEvent, targetSlug]);

  const activeEvent =
    (initialEvent && lockedMode)
      ? initialEvent
      : events.find((e) => e.id === selectedEventId) || initialEvent || events[0];

  const dedicatedEventUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/e/${activeEvent.slug || activeEvent.id}`
      : `/e/${activeEvent.slug || activeEvent.id}`;

  const handleCopyDedicatedLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(dedicatedEventUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  };

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
          ticketType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register for event");
      }

      setRegisteredAttendee(data.attendee);
      setEmailPreviewHtml(data.emailPreviewHtml || null);

      confetti({
        particleCount: 80,
        spread: 60,
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
    <div className="min-h-[calc(100vh-4rem)] bg-white flex flex-col justify-center">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          
          {/* Left Column: Zedda-style Editorial & 3D Illustration */}
          <div className="lg:col-span-6 space-y-6">
            {/* Top brand header & carousel indicator pill */}
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center space-x-2 group">
                <span className="w-1.5 h-6 bg-blue-600 rounded-sm transform -skew-x-12 group-hover:scale-105 transition-transform" />
                <span className="w-1.5 h-6 bg-sky-400 rounded-sm transform -skew-x-12 group-hover:scale-105 transition-transform" />
                <span className="text-lg font-black tracking-tight text-slate-900">
                  Passflow
                </span>
                {lockedMode && (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200/60 inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-blue-600" />
                    Verified Event
                  </span>
                )}
              </Link>

              {/* Zedda-style indicator pills (••—) */}
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-200" />
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="w-6 h-2 rounded-full bg-blue-700" />
              </div>
            </div>

            {/* Headline and Description */}
            <div className="space-y-3 pt-2">
              {lockedMode ? (
                <>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                    <Building className="w-3.5 h-3.5 text-blue-600" />
                    <span>{activeEvent.organizer || "Official Organizer"}</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 leading-[1.14] tracking-tight">
                    {activeEvent.title}
                  </h1>
                  <p className="text-sm sm:text-base text-slate-500 leading-relaxed max-w-lg">
                    {activeEvent.description ||
                      "Welcome to the official registration portal. Confirm your attendance below to get your verified QR pass."}
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-4xl sm:text-5xl font-black text-slate-900 leading-[1.12] tracking-tight">
                    Seamless Check-In &amp; Real-Time Passes
                  </h1>
                  <p className="text-base text-slate-500 leading-relaxed max-w-lg">
                    Every attendee, fully verified. Trade long registration queues for zero-click QR check-ins. Your official pass is delivered straight to your email.
                  </p>
                </>
              )}
            </div>

            {/* Event Quick Details Badge */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>
                  {new Date(activeEvent.startDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>
                  {new Date(activeEvent.startDate).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span className="truncate max-w-[200px]" title={activeEvent.venueAddress}>
                  {activeEvent.venueName}
                </span>
              </div>
            </div>

            {/* 3D Clay Illustration matching the Zedda 3D safe asset */}
            <div className="relative w-full max-w-md mx-auto lg:mx-0 pt-2 flex items-center justify-center">
              <div className="relative w-[320px] h-[320px] sm:w-[360px] sm:h-[360px]">
                <Image
                  src="/hero-ticket-3d.jpg"
                  alt="3D Event Ticket Pass Illustration"
                  fill
                  className="object-contain drop-shadow-2xl"
                  priority
                />
              </div>
            </div>
          </div>

          {/* Right Column: Clean, Minimalist Zedda-style Form or Pass */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-md">
              {!registeredAttendee ? (
                /* Registration Form */
                <div className="space-y-6">
                  {/* Title & Celebration Emoji */}
                  <div className="text-center space-y-1">
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-blue-950 tracking-tight">
                      {lockedMode ? "Claim Your Pass" : "Register for your Pass"}
                    </h2>
                    <div className="text-2xl pt-0.5">🎉</div>
                    <p className="text-sm text-slate-500">
                      Enter your details to generate your official pass
                    </p>
                  </div>

                  {/* Event Selector Pill OR Locked Event Banner */}
                  {lockedMode ? (
                    /* Closed / Locked Mode: Clear confirmation banner, no dropdown */
                    <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <div className="truncate">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">
                            Pass For Event:
                          </span>
                          <span className="font-bold text-slate-900 truncate block">
                            {activeEvent.title}
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] shrink-0 inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Direct Link
                      </span>
                    </div>
                  ) : (
                    /* Open Platform Mode: Allows selecting among active events + gives Dedicated Link */
                    <div className="space-y-2">
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium pl-1 shrink-0">Event:</span>
                        <select
                          value={selectedEventId}
                          onChange={(e) => setSelectedEventId(e.target.value)}
                          className="bg-white border border-slate-200 text-slate-900 rounded-lg px-2.5 py-1 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[210px] sm:max-w-[240px] truncate"
                        >
                          {events.map((evt) => (
                            <option key={evt.id} value={evt.id}>
                              {evt.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Organizer dedicated link hint */}
                      <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
                        <span>Has its own closed registration link:</span>
                        <Link
                          href={`/e/${activeEvent.slug || activeEvent.id}`}
                          className="text-blue-600 hover:text-blue-800 font-semibold underline inline-flex items-center gap-0.5"
                        >
                          <span>Dedicated URL</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  )}

                  {errorMsg && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                      {errorMsg}
                    </div>
                  )}

                  {/* Main Form */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Full Name */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <User className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Ifeoluwa Olawoore"
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                        />
                      </div>
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Work / Personal Email <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@company.com"
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                        />
                      </div>
                    </div>

                    {/* Phone & Organization */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Phone Number
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Phone className="w-4 h-4" />
                          </div>
                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="08012345678"
                            className="w-full pl-9 pr-3 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Organization
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Building className="w-4 h-4" />
                          </div>
                          <input
                            type="text"
                            value={organization}
                            onChange={(e) => setOrganization(e.target.value)}
                            placeholder="Company / Brand"
                            className="w-full pl-9 pr-3 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Pass Tier Selection */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Select Pass Tier
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["General Admission", "VIP", "Speaker", "Exhibitor"] as const).map((tier) => (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => setTicketType(tier)}
                            className={`p-2.5 rounded-xl border text-left transition-all ${
                              ticketType === tier
                                ? "border-blue-600 bg-blue-50/80 text-blue-900 font-bold ring-1 ring-blue-600"
                                : "border-slate-200 bg-slate-50/40 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            <div className="text-xs font-bold">{tier}</div>
                            <div className="text-[10px] text-slate-400">
                              {tier === "VIP"
                                ? "Priority gate access"
                                : tier === "Speaker"
                                ? "Stage credentials"
                                : tier === "Exhibitor"
                                ? "Booth & floor access"
                                : "Standard floor access"}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-bold text-sm tracking-wide transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 active:scale-[0.99] flex items-center justify-center space-x-2"
                    >
                      {isLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Generating Official Pass...</span>
                        </>
                      ) : (
                        <>
                          <span>Confirm &amp; Get Instant Pass</span>
                          <span className="font-mono text-base">&rarr;</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              ) : (
                /* Ticket Confirmation Card */
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="text-center space-y-1">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-1">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                      You&apos;re All Set!
                    </h2>
                    <p className="text-xs text-slate-500">
                      Your admission pass has been created and sent to your email.
                    </p>
                  </div>

                  {/* Ticket Card */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 text-center space-y-4">
                    <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-200">
                      <span className="font-mono text-blue-700 font-bold text-sm">
                        {registeredAttendee.id}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] uppercase">
                        {registeredAttendee.ticketType}
                      </span>
                    </div>

                    {/* Clean QR code */}
                    <div className="bg-white p-4 rounded-2xl inline-block shadow-sm border border-slate-200">
                      <QRCodeSVG
                        value={registeredAttendee.qrHash || registeredAttendee.id}
                        size={210}
                        level="H"
                        includeMargin={false}
                      />
                    </div>

                    <div>
                      <div className="text-base font-bold text-slate-900">{registeredAttendee.fullName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{activeEvent.title}</div>
                    </div>

                    <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                      Zero-Click Fast-Track Entry &bull; Scan at Gate
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <a
                      href={`/ticket/${registeredAttendee.id}`}
                      target="_blank"
                      className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Mobile Pass</span>
                    </a>

                    <button
                      type="button"
                      onClick={handlePrint}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-200 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Print Pass</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setShowEmailModal(true)}
                      className="text-blue-600 hover:underline font-semibold flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview Email</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRegisteredAttendee(null);
                        setFullName("");
                        setEmail("");
                        setPhone("");
                      }}
                      className="text-slate-400 hover:text-slate-600 font-medium"
                    >
                      &larr; Register another
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Email Preview Modal */}
      {showEmailModal && emailPreviewHtml && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-sm text-slate-900">Delivered Admission Ticket Email</span>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xs px-2.5 py-1 rounded-lg bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-50">
              <iframe
                title="Email Preview"
                srcDoc={emailPreviewHtml}
                className="w-full h-[600px] rounded-xl border border-slate-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
