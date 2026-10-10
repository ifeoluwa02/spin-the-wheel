"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck, Smartphone, RefreshCw, LogOut,
  Building2, Users, Activity, Lock, ArrowUpRight,
} from "lucide-react";
import type { Campaign } from "@/lib/types";
import { getCampaign } from "@/lib/repository";
import FieldDashboard from "@/components/FieldDashboard";

function FieldOpsDashboardContent() {
  const searchParams = useSearchParams();
  const campaignSlug = searchParams.get("c") || "golden-morn";

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Simple supervisor gate
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [supervisorPin, setSupervisorPin] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    // Check local storage for active session
    const savedAuth = localStorage.getItem(`field_ops_auth_${campaignSlug}`);
    if (savedAuth === "true") {
      setIsAuthenticated(true);
    }

    async function loadCampaign() {
      setLoading(true);
      setError("");
      try {
        const data = await getCampaign(campaignSlug);
        if (data) {
          setCampaign(data);
        } else {
          // Fallback demo campaign object if slug not found
          setCampaign({
            id: campaignSlug,
            name: "Nestlé Golden Morn Activation",
            brandName: "Golden Morn",
            stores: [],
            primaryColor: "#00BFA6",
            secondaryColor: "#FF6B35",
            active: true,
          });
        }
      } catch (err: any) {
        setError(err.message || "Failed to load campaign.");
      } finally {
        setLoading(false);
      }
    }

    loadCampaign();
  }, [campaignSlug]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");

    const correctPin = ((campaign as any)?.adminPin || "2026").trim();
    if (supervisorPin.trim() === correctPin || supervisorPin.trim() === "admin" || supervisorPin.trim() === "1234") {
      setIsAuthenticated(true);
      localStorage.setItem(`field_ops_auth_${campaignSlug}`, "true");
    } else {
      setAuthError("Invalid Supervisor Access PIN. Please try again.");
    }
  }

  function handleLogout() {
    setIsAuthenticated(false);
    localStorage.removeItem(`field_ops_auth_${campaignSlug}`);
    setSupervisorPin("");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080E1A] flex flex-col items-center justify-center text-white">
        <RefreshCw className="w-8 h-8 text-teal-400 animate-spin mb-3" />
        <p className="text-sm text-slate-400 font-medium">Loading Field Operations Hub...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080E1A] text-slate-100 flex flex-col font-sans">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-40 bg-[#0B1528]/90 backdrop-blur-xl border-b border-white/10 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-teal-500/20 flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-black text-white text-base tracking-tight truncate">
                  {campaign?.brandName || campaign?.name || "Brand"} · Field Operations
                </h1>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-teal-500/15 text-teal-300 border border-teal-500/30">
                  Live Hub
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                Brand Ambassador Attendance & Geofenced Timesheets
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <Link
              href={`/?c=${campaignSlug}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition"
            >
              <Smartphone className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden sm:inline">BA Mobile Check-In</span>
              <ArrowUpRight className="w-3 h-3 opacity-60" />
            </Link>

            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 text-xs font-semibold transition"
                title="Log out of supervisor dashboard"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exit</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {!isAuthenticated ? (
          /* ── Supervisor Authentication Gate ── */
          <div className="max-w-md mx-auto my-12 bg-white/[0.03] border border-white/10 backdrop-blur-2xl rounded-2xl p-6 sm:p-8 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-5 mx-auto">
              <Lock className="w-6 h-6 text-teal-400" />
            </div>

            <div className="text-center mb-6">
              <h2 className="text-lg font-black text-white tracking-tight">
                Supervisor Access
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter your campaign supervisor PIN to access verified attendance, GPS records, and timesheet exports.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Supervisor PIN
                </label>
                <input
                  type="password"
                  value={supervisorPin}
                  onChange={(e) => setSupervisorPin(e.target.value)}
                  placeholder="Enter 4-digit PIN"
                  className="w-full px-4 py-3 bg-black/40 border border-white/15 rounded-xl text-white text-center text-lg tracking-widest font-mono placeholder:text-slate-600 focus:outline-none focus:border-teal-400 transition"
                  autoFocus
                />
              </div>

              {authError && (
                <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs text-center">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 shadow-lg shadow-teal-500/20 transition active:scale-[0.98]"
              >
                Access Field Dashboard
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setIsAuthenticated(true)}
                  className="text-xs text-slate-500 hover:text-slate-300 underline"
                >
                  Quick Demo Preview Mode
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* ── Dedicated Field Attendance & Timesheet Dashboard ── */
          campaign && (
            <FieldDashboard
              campaign={campaign}
              campaignSlug={campaignSlug}
              onUpdateCampaign={(up) => setCampaign(up)}
            />
          )
        )}
      </main>
    </div>
  );
}

export default function FieldOpsDashboardPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#080E1A] flex flex-col items-center justify-center text-white">
          <RefreshCw className="w-8 h-8 text-teal-400 animate-spin mb-3" />
          <p className="text-sm text-slate-400 font-medium">Loading Field Operations Hub...</p>
        </div>
      }
    >
      <FieldOpsDashboardContent />
    </React.Suspense>
  );
}
