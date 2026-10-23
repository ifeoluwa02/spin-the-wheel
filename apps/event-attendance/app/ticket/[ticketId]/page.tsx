"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  Calendar,
  MapPin,
  Clock,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Share2,
  Printer,
  ChevronLeft,
} from "lucide-react";
import Link from "next/link";
import { AttendeeRegistration, EventItem } from "@/lib/types";
import { fetchAttendeeByTicketId, fetchEventById, INITIAL_ATTENDEES, INITIAL_EVENTS } from "@/lib/repository";

export default function MobileTicketPage() {
  const params = useParams();
  const ticketId = params.ticketId as string;

  const [attendee, setAttendee] = useState<AttendeeRegistration | null>(null);
  const [event, setEvent] = useState<EventItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        let att = await fetchAttendeeByTicketId(ticketId);
        if (!att) {
          att = INITIAL_ATTENDEES.find((a) => a.id.toLowerCase() === ticketId?.toLowerCase()) || null;
        }

        if (att) {
          setAttendee(att);
          let evt = await fetchEventById(att.eventId);
          if (!evt) {
            evt = INITIAL_EVENTS.find((e) => e.id === att?.eventId) || INITIAL_EVENTS[0];
          }
          setEvent(evt);
        }
      } catch (err) {
        console.error("Failed to load ticket:", err);
      } finally {
        setIsLoading(false);
      }
    }

    if (ticketId) {
      loadData();
    }
  }, [ticketId]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Entry Pass for ${event?.title}`,
          text: `Here is my entry pass (${attendee?.id}) for ${event?.title}`,
          url: window.location.href,
        });
      } catch {
        // Cancelled
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500">Loading your admission pass...</p>
        </div>
      </div>
    );
  }

  if (!attendee || !event) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="light-card max-w-md w-full p-8 rounded-2xl text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h1 className="text-lg font-bold text-slate-900">Ticket Not Found</h1>
          <p className="text-xs text-slate-500">
            No registration matching ticket ID <span className="font-mono text-blue-600 font-bold">{ticketId}</span> was found in the database.
          </p>
          <Link
            href="/"
            className="inline-block mt-4 py-2 px-4 rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            &larr; Back to Registration
          </Link>
        </div>
      </div>
    );
  }

  const isCheckedIn = attendee.status === "checked_in";

  return (
    <div className="max-w-md mx-auto px-4 py-6 sm:py-10 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </Link>
        <span className="text-[11px] font-mono text-slate-400">OFFICIAL PASS</span>
      </div>

      <div className="light-card rounded-3xl overflow-hidden shadow-xl border border-slate-200">
        {/* Banner */}
        <div className="p-6 bg-gradient-to-r from-blue-600 to-sky-600 text-white text-center">
          <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2">
            {attendee.ticketType} PASS
          </div>
          <h1 className="text-lg font-extrabold leading-snug">{event.title}</h1>
          <p className="text-xs text-white/80 mt-1">{event.venueName}</p>
        </div>

        {/* Status Chip */}
        <div className="px-6 pt-5 pb-2 text-center">
          {isCheckedIn ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Admitted &bull; {new Date(attendee.checkedInAt || "").toLocaleTimeString()}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold uppercase tracking-wider">
              <Ticket className="w-3.5 h-3.5" />
              <span>Confirmed &bull; Ready for Check-in</span>
            </div>
          )}
        </div>

        {/* QR Section */}
        <div className="p-6 text-center">
          <div className="bg-white p-4 rounded-2xl inline-block shadow-sm border border-slate-200">
            <QRCodeSVG
              value={attendee.qrHash || attendee.id}
              size={220}
              level="H"
              includeMargin={false}
            />
          </div>

          <div className="mt-4 font-mono font-bold text-sm tracking-widest text-blue-600">
            {attendee.id}
          </div>

          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-mono mt-1">
            Zero-Click Scanner Ready &bull; Present at Door
          </p>
        </div>

        {/* Details */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 space-y-2.5 text-xs">
          <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
            <span className="text-slate-500">Attendee Name</span>
            <span className="font-semibold text-slate-900">{attendee.fullName}</span>
          </div>
          {attendee.organization && (
            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500">Organization</span>
              <span className="font-semibold text-slate-900">{attendee.organization}</span>
            </div>
          )}
          <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
            <span className="text-slate-500">Date</span>
            <span className="font-semibold text-slate-900">
              {new Date(event.startDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
            <span className="text-slate-500">Entry Time</span>
            <span className="font-semibold text-slate-900">
              {new Date(event.startDate).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex justify-between items-start py-1">
            <span className="text-slate-500">Venue Address</span>
            <span className="font-semibold text-slate-900 text-right max-w-[200px]">
              {event.venueAddress}, {event.city}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-100 grid grid-cols-2 gap-2 text-center">
          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 border border-slate-200 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{copied ? "Link Copied!" : "Share Pass"}</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-colors shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Save / Print</span>
          </button>
        </div>
      </div>
    </div>
  );
}
