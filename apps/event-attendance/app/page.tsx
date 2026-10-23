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
  ChevronRight,
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
              <div className="flex items-center space-x-2">
                <span className="w-1.5 h-6 bg-blue-600 rounded-sm transform -skew-x-12" />
                <span className="w-1.5 h-6 bg-sky-400 rounded-sm transform -skew-x-12" />
                <span className="text-lg font-black tracking-tight text-slate-900">
                  Passflow
                </span>
              </div>

              {/* Zedda-style indicator pills (••—) */}
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-200" />
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="w-6 h-2 rounded-full bg-blue-700" />
              </div>
            </div>

            {/* Bold Headline matching screenshot */}
            <div className="space-y-3 pt-2">
              <h1 className="text-4xl sm:text-5xl font-black text-slate-900 leading-[1.12] tracking-tight">
                Seamless Check-In &amp; Real-Time Passes
              </h1>
              <p className="text-base text-slate-500 leading-relaxed max-w-lg">
                Every attendee, fully verified. Trade long registration queues for zero-click QR check-ins. Your official pass is delivered straight to your email.
              </p>
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
                <span className="truncate max-w-[200px]">{activeEvent.venueName}</span>
              </div>
            </div>

            {/* 3D Clay Illustration matching the Zedda 3D safe asset */}
            <div className="relative w-full max-w-md mx-auto lg:mx-0 pt-2 flex items-center justify-center">
              <div className="relative w-[340px] h-[340px] sm:w-[380px] sm:h-[380px]">
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
                      Register for your Pass
                    </h2>
                    <div className="text-2xl pt-0.5">🎉</div>
                    <p className="text-sm text-slate-500">
                      Enter your details to generate your official pass
                    </p>
                  </div>

                  {/* Event Selector Pill */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium pl-1">Event:</span>
                    <select
                      value={selectedEventId}
                      onChange={(e) => setSelectedEventId(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-900 rounded-lg px-2.5 py-1 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[240px] truncate"
                    >
                      {events.map((evt) => (
                        <option key={evt.id} value={evt.id}>
                          {evt.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {errorMsg && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-medium">
                      {errorMsg}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Full Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter your full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 focus:outline-none transition-all"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Email
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="Enter your email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 focus:outline-none transition-all"
                      />
                    </div>

                    {/* Phone & Organization Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          placeholder="e.g. 08012345678"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Organization
                        </label>
                        <input
                          type="text"
                          placeholder="Company name"
                          value={organization}
                          onChange={(e) => setOrganization(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-50 focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Pass Type Selector */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Pass Tier
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["General Admission", "VIP"] as const).map((type) => (
                          <button
                            type="button"
                            key={type}
                            onClick={() => setTicketType(type)}
                            className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                              ticketType === type
                                ? "bg-blue-50 border-blue-600 text-blue-700 shadow-sm"
                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Primary Button matching Zedda electric blue gradient */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600 shadow-lg shadow-blue-500/25 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                      >
                        {isLoading ? (
                          <span>Generating your Pass...</span>
                        ) : (
                          <span>Claim Admission Pass</span>
                        )}
                      </button>
                    </div>

                    {/* Subtext Link */}
                    <div className="text-center pt-2">
                      <p className="text-xs text-slate-500">
                        Event staff or gate admin?{" "}
                        <Link href="/scan" className="text-blue-600 font-semibold hover:underline">
                          Open Gate Scanner
                        </Link>
                      </p>
                    </div>
                  </form>
                </div>
              ) : (
                /* Registration Success & Instant Digital Pass View in Clean Light Theme */
                <div className="light-card rounded-3xl p-6 sm:p-8 space-y-6">
                  <div className="text-center space-y-1">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2 border border-emerald-100">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900">
                      You&apos;re All Set!
                    </h2>
                    <p className="text-xs text-slate-500">
                      Your admission ticket is confirmed and sent to <strong>{registeredAttendee.email}</strong>
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
