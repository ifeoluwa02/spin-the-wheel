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
        // User cancelled share
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
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">Loading your admission pass...</p>
        </div>
      </div>
    );
  }

  if (!attendee || !event) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="glass-card max-w-md w-full p-8 rounded-2xl text-center space-y-4 border border-rose-500/30">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h1 className="text-lg font-bold text-white">Ticket Not Found</h1>
          <p className="text-xs text-slate-400">
            No registration matching ticket ID <span className="font-mono text-indigo-400 font-bold">{ticketId}</span> was found in the database.
          </p>
          <Link
            href="/"
            className="inline-block mt-4 py-2 px-4 rounded-xl bg-slate-800 text-xs font-semibold text-white hover:bg-slate-700"
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
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </Link>
        <span className="text-[11px] font-mono text-slate-400">OFFICIAL PASS</span>
      </div>

      {/* Main Ticket Card */}
      <div className="glass-card rounded-3xl overflow-hidden shadow-2xl border border-slate-700/80">
        {/* Banner */}
        <div className={`p-6 bg-gradient-to-r ${event.bannerGradient || "from-indigo-600 to-purple-700"} text-white text-center relative`}>
          <div className="inline-block bg-black/30 backdrop-blur-md px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2">
            {attendee.ticketType} PASS
          </div>
          <h1 className="text-lg font-extrabold leading-snug">{event.title}</h1>
          <p className="text-xs text-white/80 mt-1">{event.venueName}</p>
        </div>

        {/* Status Chip */}
        <div className="px-6 pt-5 pb-2 text-center">
          {isCheckedIn ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Admitted &bull; {new Date(attendee.checkedInAt || "").toLocaleTimeString()}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-xs font-bold uppercase tracking-wider">
              <Ticket className="w-3.5 h-3.5" />
              <span>Confirmed &bull; Ready for Check-in</span>
            </div>
          )}
        </div>

        {/* QR Section */}
        <div className="p-6 text-center">
          <div className="bg-white p-4 rounded-2xl inline-block shadow-2xl border border-slate-200">
            <QRCodeSVG
              value={attendee.qrHash || attendee.id}
              size={230}
              level="H"
              includeMargin={false}
            />
          </div>

          <div className="mt-4 font-mono font-bold text-sm tracking-widest text-indigo-400">
            {attendee.id}
          </div>

          <p className="text-[11px] text-slate-500 uppercase tracking-wider font-mono mt-1">
            Zero-Click Scanner Ready &bull; High Contrast
          </p>
        </div>

        {/* Attendee Details */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/40 space-y-2.5 text-xs">
          <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Attendee Name</span>
            <span className="font-semibold text-white">{attendee.fullName}</span>
          </div>
          {attendee.organization && (
            <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Organization</span>
              <span className="font-semibold text-white">{attendee.organization}</span>
            </div>
          )}
          <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Date</span>
            <span className="font-semibold text-white">
              {new Date(event.startDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Entry Time</span>
            <span className="font-semibold text-white">
              {new Date(event.startDate).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex justify-between items-start py-1">
            <span className="text-slate-400">Venue Address</span>
            <span className="font-semibold text-white text-right max-w-[200px]">
              {event.venueAddress}, {event.city}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 grid grid-cols-2 gap-2 text-center">
          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{copied ? "Link Copied!" : "Share Pass"}</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Save / Print</span>
          </button>
        </div>
      </div>
    </div>
  );
}
