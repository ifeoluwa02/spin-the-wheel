"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck, Smartphone, RefreshCw, LogOut,
  Lock, ArrowUpRight, User, KeyRound, Eye, EyeOff, Settings,
} from "lucide-react";
import type { Campaign } from "@/lib/types";
import FieldDashboard from "@/components/FieldDashboard";

function FieldOpsDashboardContent() {
  const searchParams = useSearchParams();
  const campaignSlug = (searchParams.get("c") || "golden-morn").trim().toLowerCase();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Supervisor Username & Password gate (verified server-side)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string>("");
  const [supervisorUsername, setSupervisorUsername] = useState("");
  const [supervisorPin, setSupervisorPin] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const lastActiveStorageKey = `field_ops_last_active_${campaignSlug}`;

  useEffect(() => {
    async function initDashboard() {
      setLoading(true);
      setError("");
      try {
        const INACTIVITY_LIMIT_MS = 60 * 60 * 1000; // 1 hour
        const lastActiveRaw = localStorage.getItem(lastActiveStorageKey);
        if (lastActiveRaw && Date.now() - Number(lastActiveRaw) >= INACTIVITY_LIMIT_MS) {
          try {
            await fetch("/api/auth?role=admin", { method: "DELETE" });
          } catch {}
          localStorage.removeItem(`field_ops_token_${campaignSlug}`);
          localStorage.removeItem(lastActiveStorageKey);
          setIsAuthenticated(false);
          setAuthToken("");
          setAuthError("Your session expired after 1 hour of inactivity. Please sign in again.");
        } else {
          // 1. Verify existing session cookie / Bearer token against /api/auth
          const savedToken = localStorage.getItem(`field_ops_token_${campaignSlug}`) || "";
          const authHeaders: Record<string, string> = {};
          if (savedToken) {
            authHeaders["Authorization"] = `Bearer ${savedToken}`;
          }

          const authRes = await fetch("/api/auth", { headers: authHeaders });
          if (authRes.ok) {
            const authData = await authRes.json();
            const user = authData.user;
            if (
              authData.authenticated &&
              user &&
              (user.role === "superadmin" ||
                (user.role === "supervisor" &&
                  user.campaignId?.toLowerCase() === campaignSlug))
            ) {
              localStorage.setItem(lastActiveStorageKey, String(Date.now()));
              setIsAuthenticated(true);
              setAuthToken(savedToken);
            } else {
              localStorage.removeItem(`field_ops_token_${campaignSlug}`);
              localStorage.removeItem(lastActiveStorageKey);
            }
          } else {
            localStorage.removeItem(`field_ops_token_${campaignSlug}`);
            localStorage.removeItem(lastActiveStorageKey);
          }
        }

        // 2. Load campaign metadata via API
        const activeToken = localStorage.getItem(`field_ops_token_${campaignSlug}`) || "";
        const campRes = await fetch(
          `/api/campaigns?slug=${encodeURIComponent(campaignSlug)}`,
          { headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {} }
        );
        if (campRes.ok) {
          const campData = await campRes.json();
          if (campData.campaign) {
            setCampaign(campData.campaign);
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load campaign.");
      } finally {
        setLoading(false);
      }
    }

    initDashboard();
  }, [campaignSlug, lastActiveStorageKey]);

  // ── 1-Hour Inactivity Auto-Logout & Sliding Session Renewal ──
  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") return;
    const INACTIVITY_LIMIT_MS = 60 * 60 * 1000; // 1 hour
    const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // Renew token at most every 5 mins of active use
    let lastRefreshAt = Date.now();

    const recordActivity = () => {
      const now = Date.now();
      const prevActive = Number(localStorage.getItem(lastActiveStorageKey) || now);
      if (now - prevActive >= INACTIVITY_LIMIT_MS) {
        handleLogout("Your session expired after 1 hour of inactivity. Please sign in again.");
        return;
      }
      localStorage.setItem(lastActiveStorageKey, String(now));

      if (now - lastRefreshAt >= REFRESH_INTERVAL_MS) {
        lastRefreshAt = now;
        const currentToken = localStorage.getItem(`field_ops_token_${campaignSlug}`) || authToken;
        fetch("/api/auth?touch=1", {
          headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.token) {
              setAuthToken(d.token);
              localStorage.setItem(`field_ops_token_${campaignSlug}`, d.token);
            }
          })
          .catch(() => {});
      }
    };

    localStorage.setItem(
      lastActiveStorageKey,
      localStorage.getItem(lastActiveStorageKey) || String(Date.now())
    );

    const events = ["mousedown", "keydown", "touchstart", "scroll", "click"];
    for (const ev of events) {
      window.addEventListener(ev, recordActivity, { passive: true });
    }

    const watchdog = window.setInterval(() => {
      const lastActive = Number(localStorage.getItem(lastActiveStorageKey) || Date.now());
      if (Date.now() - lastActive >= INACTIVITY_LIMIT_MS) {
        handleLogout("Your session expired after 1 hour of inactivity. Please sign in again.");
      }
    }, 30_000);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, recordActivity);
      }
      window.clearInterval(watchdog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, campaignSlug, lastActiveStorageKey]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "supervisor",
          campaignId: campaignSlug,
          username: supervisorUsername.trim(),
          password: supervisorPin.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAuthError(data.error || "Invalid Supervisor username or password.");
        return;
      }
      if (data.token) {
        setAuthToken(data.token);
        localStorage.setItem(`field_ops_token_${campaignSlug}`, data.token);
      }
      localStorage.setItem(lastActiveStorageKey, String(Date.now()));
      setIsAuthenticated(true);
    } catch {
      setAuthError("Network error while verifying credentials.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout(reasonMsg?: string | React.MouseEvent) {
    try {
      await fetch("/api/auth?role=admin", { method: "DELETE" });
    } catch {}
    setIsAuthenticated(false);
    setAuthToken("");
    localStorage.removeItem(`field_ops_token_${campaignSlug}`);
    localStorage.removeItem(`field_ops_auth_${campaignSlug}`);
    localStorage.removeItem(lastActiveStorageKey);
    setSupervisorUsername("");
    setSupervisorPin("");
    if (typeof reasonMsg === "string" && reasonMsg) {
      setAuthError(reasonMsg);
    }
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
                Brand Ambassador Attendance, Live Geofence Map & Flagged Review Queue
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <Link
              href="/superadmin"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 text-xs font-semibold transition"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Superadmin</span>
            </Link>

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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 text-xs font-semibold transition cursor-pointer"
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
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
            {error}
          </div>
        )}

        {!isAuthenticated ? (
          /* ── Supervisor Authentication Gate ── */
          <div className="max-w-md mx-auto my-12 bg-white/[0.03] border border-white/10 backdrop-blur-2xl rounded-2xl p-6 sm:p-8 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-5 mx-auto">
              <Lock className="w-6 h-6 text-teal-400" />
            </div>

            <div className="text-center mb-6">
              <h2 className="text-lg font-black text-white tracking-tight">
                Supervisor Sign In
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Sign in with your campaign supervisor username and password to access verified attendance, live team tracking, and survey exports.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Supervisor Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={supervisorUsername}
                    onChange={(e) => setSupervisorUsername(e.target.value)}
                    placeholder="e.g. supervisor or goldenmorn"
                    className="w-full pl-10 pr-4 py-3 bg-black/40 border border-white/15 rounded-xl text-white text-xs focus:outline-none focus:border-teal-400 transition"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={supervisorPin}
                    onChange={(e) => setSupervisorPin(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-10 pr-10 py-3 bg-black/40 border border-white/15 rounded-xl text-white text-xs focus:outline-none focus:border-teal-400 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {authError && (
                <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs text-center">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 shadow-lg shadow-teal-500/20 transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {authLoading ? "Signing In..." : "Sign In to Field Dashboard"}
              </button>
            </form>
          </div>
        ) : (
          /* ── Dedicated Field Attendance & Timesheet Dashboard ── */
          campaign && (
            <FieldDashboard
              campaign={campaign}
              campaignSlug={campaignSlug}
              authToken={authToken}
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
