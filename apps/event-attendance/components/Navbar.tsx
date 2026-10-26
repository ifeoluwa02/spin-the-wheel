"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Ticket,
  ScanLine,
  ShieldCheck,
  Lock,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname() || "";

  // Check if current route is an event-specific route
  const isDedicatedEventRoute = pathname.startsWith("/e/");
  const pathParts = pathname.split("/").filter(Boolean);
  // e.g. ["e", "nestle-summit-2026", "admin"]
  const eventSlug = isDedicatedEventRoute && pathParts.length >= 2 ? pathParts[1] : null;

  const isEventAttendeePage = isDedicatedEventRoute && pathParts.length === 2;
  const isEventAdminPage = isDedicatedEventRoute && pathParts[2] === "admin";
  const isEventScanPage = isDedicatedEventRoute && pathParts[2] === "scan";
  const isTicketViewPage = pathname.startsWith("/ticket/");

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo in Zedda Geometric Style */}
        <div className="flex items-center space-x-3">
          <Link href="/" className="flex items-center space-x-2.5 group">
            <div className="flex items-center space-x-1">
              <span className="w-2 h-7 bg-blue-600 rounded-sm transform -skew-x-12 group-hover:scale-105 transition-transform" />
              <span className="w-2 h-7 bg-sky-400 rounded-sm transform -skew-x-12 group-hover:scale-105 transition-transform" />
            </div>
            <span className="text-xl font-black tracking-tight text-slate-900">
              Passflow
            </span>
          </Link>

          {/* Event Context Pill if inside dedicated event */}
          {eventSlug && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-mono font-medium border border-slate-200/60 max-w-[200px] truncate">
              <span>/e/{eventSlug}</span>
            </span>
          )}
        </div>

        {/* Dynamic Contextual Navigation */}
        <nav className="flex items-center space-x-2">
          {/* CASE 1: Event Attendee Registration Page (/e/[slug]) */}
          {isEventAttendeePage ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200/60">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Official Pass Portal</span>
              </span>

              {/* Discreet Staff Portal link */}
              <Link
                href={`/e/${eventSlug}/scan`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="Gate Staff & Usher Login"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden xs:inline">Gate Staff Login</span>
                <span className="xs:hidden">Staff</span>
              </Link>
            </div>
          ) : isTicketViewPage ? (
            /* CASE 2: Attendee Mobile Pass View (/ticket/[ticketId]) */
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                Verified Digital Pass
              </span>
            </div>
          ) : isDedicatedEventRoute ? (
            /* CASE 3: Dedicated Event Staff Portals (/e/[slug]/admin or /e/[slug]/scan) */
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href={`/e/${eventSlug}`}
                className="hidden md:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <Ticket className="w-3.5 h-3.5" />
                <span>Registration</span>
              </Link>

              <Link
                href={`/e/${eventSlug}/scan`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isEventScanPage
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
              >
                <ScanLine className="w-3.5 h-3.5" />
                <span>Gate Scanner</span>
              </Link>

              <Link
                href={`/e/${eventSlug}/admin`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isEventAdminPage
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin</span>
              </Link>
            </div>
          ) : (
            /* CASE 4: Global Platform Pages (/, /admin, /scan) */
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href="/"
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  pathname === "/"
                    ? "bg-slate-100 text-slate-900 font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Ticket className="w-4 h-4 text-slate-500" />
                <span>Events</span>
              </Link>

              <Link
                href="/scan"
                className={`flex items-center space-x-1 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  pathname === "/scan"
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100/80"
                }`}
              >
                <ScanLine className="w-4 h-4" />
                <span>Scanner</span>
              </Link>

              <Link
                href="/admin"
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  pathname === "/admin"
                    ? "bg-slate-900 text-white font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-slate-500" />
                <span>Super-Admin</span>
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
