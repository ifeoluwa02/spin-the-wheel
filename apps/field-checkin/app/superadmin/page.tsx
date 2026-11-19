"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import type {
  Campaign,
  StoreLocation,
  SurveyType,
  SurveyQuestion,
  SurveyQuestionType,
} from "@/lib/types";
import { NIGERIAN_STATES } from "@/lib/types";
import { DEFAULT_HOSPITAL_QUESTIONS } from "@/lib/survey-templates";
import {
  ShieldCheck, Lock, User, Eye, EyeOff, Plus, Building2,
  MapPin, ExternalLink, Copy, Check, Trash2, Navigation,
  ShoppingBag, HeartPulse, RefreshCw, LogOut, Settings,
  Smartphone, Users, KeyRound, ClipboardList, Sparkles,
} from "lucide-react";

export default function SuperAdminPage() {
  // ── Auth State ──
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // ── Campaigns State ──
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState("");

  // ── Create New Event Modal State ──
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newType, setNewType] = useState<SurveyType>("retail");
  const [newGeofenceEnabled, setNewGeofenceEnabled] = useState(true);
  const [newAdminUser, setNewAdminUser] = useState("");
  const [newAdminPass, setNewAdminPass] = useState("");
  const [seedStarter, setSeedStarter] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // ── Active Campaign Store Manager State ──
  const [managingCampaign, setManagingCampaign] = useState<Campaign | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeCode, setStoreCode] = useState("");
  const [storeState, setStoreState] = useState("Lagos");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeLat, setStoreLat] = useState("6.7148");
  const [storeLng, setStoreLng] = useState("3.4025");
  const [storeRadius, setStoreRadius] = useState("200");
  const [baName, setBaName] = useState("");
  const [baUsername, setBaUsername] = useState("");
  const [baPassword, setBaPassword] = useState("1234");
  const [baPhone, setBaPhone] = useState("");
  const [savingStore, setSavingStore] = useState(false);
  const [gpsFetching, setGpsFetching] = useState(false);

  // ── Survey Questions Builder Modal State ──
  const [questionsCampaign, setQuestionsCampaign] = useState<Campaign | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<SurveyQuestion[]>([]);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [newQLabel, setNewQLabel] = useState("");
  const [newQType, setNewQType] = useState<SurveyQuestionType>("text");
  const [newQOptions, setNewQOptions] = useState("");
  const [newQRequired, setNewQRequired] = useState(true);

  // ── Offline / Pending Sync State ──
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCampaigns, setPendingCampaigns] = useState<Record<string, Campaign>>({});
  const [syncingPending, setSyncingPending] = useState(false);

  function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("field_ops_superadmin_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  function applyAndCacheCampaigns(nextList: Campaign[]) {
    setCampaigns(nextList);
    if (typeof window !== "undefined") {
      localStorage.setItem("field_ops_cached_campaigns", JSON.stringify(nextList));
    }
  }

  function queuePendingCampaign(camp: Campaign) {
    const slug = camp.id || "golden-morn";
    const updatedCamp: Campaign = { ...camp, id: slug, updatedAt: Date.now() };
    setPendingCampaigns((prev) => {
      const next = { ...prev, [slug]: updatedCamp };
      if (typeof window !== "undefined") {
        localStorage.setItem("field_ops_pending_campaigns", JSON.stringify(next));
      }
      return next;
    });
    setCampaigns((prev) => {
      const nextList = [updatedCamp, ...prev.filter((c) => c.id !== slug)];
      if (typeof window !== "undefined") {
        localStorage.setItem("field_ops_cached_campaigns", JSON.stringify(nextList));
      }
      return nextList;
    });
    return updatedCamp;
  }

  async function syncPendingCampaigns(explicitToken?: string): Promise<Record<string, Campaign>> {
    if (typeof window === "undefined") return {};
    let storedPending: Record<string, Campaign> = {};
    try {
      const raw = localStorage.getItem("field_ops_pending_campaigns");
      if (raw) storedPending = JSON.parse(raw);
    } catch {}

    const entries = Object.entries(storedPending);
    if (entries.length === 0) return {};

    setSyncingPending(true);
    const token = explicitToken ?? localStorage.getItem("field_ops_superadmin_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const remaining: Record<string, Campaign> = {};
    for (const [slug, camp] of entries) {
      try {
        const res = await fetch("/api/campaigns", {
          method: "POST",
          headers,
          body: JSON.stringify(camp),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          if (res.status >= 500) remaining[slug] = camp;
        }
      } catch {
        remaining[slug] = camp;
      }
    }

    setPendingCampaigns(remaining);
    if (Object.keys(remaining).length > 0) {
      localStorage.setItem("field_ops_pending_campaigns", JSON.stringify(remaining));
    } else {
      localStorage.removeItem("field_ops_pending_campaigns");
    }
    setSyncingPending(false);
    return remaining;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    try {
      const rawPending = localStorage.getItem("field_ops_pending_campaigns");
      if (rawPending) setPendingCampaigns(JSON.parse(rawPending));
    } catch {}

    const handleOnline = () => {
      setIsOnline(true);
      loadCampaigns();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function verifyAndLoad() {
      const token = localStorage.getItem("field_ops_superadmin_token");
      if (token) {
        // Hydrate cached campaigns immediately so offline refreshes never lose events
        try {
          const cached = localStorage.getItem("field_ops_cached_campaigns");
          if (cached) setCampaigns(JSON.parse(cached));
        } catch {}
      }
      try {
        const res = await fetch("/api/auth", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user?.role === "superadmin") {
            setIsAuthenticated(true);
            await loadCampaigns(token || undefined);
            return;
          }
        } else if (res.status === 401) {
          localStorage.removeItem("field_ops_superadmin_token");
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }
      } catch {
        // Network offline during refresh: if token exists locally, allow offline access to cached campaigns
        if (token) {
          setIsAuthenticated(true);
          setLoading(false);
          return;
        }
      }
      localStorage.removeItem("field_ops_superadmin_token");
      setIsAuthenticated(false);
      setLoading(false);
    }
    verifyAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCampaigns(explicitToken?: string) {
    setLoading(true);
    try {
      // First push any pending offline campaign edits to the server
      const remainingPending = await syncPendingCampaigns(explicitToken);

      const token = explicitToken ?? localStorage.getItem("field_ops_superadmin_token");
      const res = await fetch("/api/campaigns", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const serverList: Campaign[] = data.campaigns || [];
        const mergedMap = new Map<string, Campaign>();
        for (const c of serverList) {
          if (c.id) mergedMap.set(c.id, c);
        }
        // Keep any still-unsynced local campaigns merged on top
        for (const [slug, localCamp] of Object.entries(remainingPending)) {
          mergedMap.set(slug, localCamp);
        }
        applyAndCacheCampaigns(
          Array.from(mergedMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        );
      } else if (res.status === 401) {
        setIsAuthenticated(false);
        localStorage.removeItem("field_ops_superadmin_token");
      }
    } catch (err) {
      console.warn("Offline while loading campaigns — displaying cached campaigns:", err);
      try {
        const cached = localStorage.getItem("field_ops_cached_campaigns");
        if (cached) setCampaigns(JSON.parse(cached));
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  async function handleSuperAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "superadmin",
          username: username.trim(),
          password: password.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAuthError(data.error || "Invalid Superadmin credentials.");
        return;
      }
      localStorage.setItem("field_ops_superadmin_token", data.token);
      setIsAuthenticated(true);
      loadCampaigns(data.token);
    } catch {
      setAuthError("Network error while signing in.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth?role=admin", { method: "DELETE" });
    } catch {}
    localStorage.removeItem("field_ops_superadmin_token");
    setIsAuthenticated(false);
    setUsername("");
    setPassword("");
  }

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError("");

    const slug = (newSlug || newName)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const payload: Campaign = {
      id: slug,
      name: newName.trim(),
      brandName: newBrand.trim() || newName.trim(),
      activationType: newType,
      geofenceEnabled: newGeofenceEnabled,
      adminUsername: newAdminUser.trim() || `${slug.split("-")[0]}_admin`,
      adminPassword: newAdminPass.trim() || "2026",
      adminPin: newAdminPass.trim() || "2026",
      stores: [],
      surveyQuestions: newType === "hospital" ? DEFAULT_HOSPITAL_QUESTIONS : undefined,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...payload,
          seedDefaultStores: seedStarter,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCreateError(data.error || "Could not create campaign.");
        return;
      }
      applyAndCacheCampaigns([
        data.campaign,
        ...campaigns.filter((c) => c.id !== data.campaign.id),
      ]);
      setIsCreateOpen(false);
      setNewName("");
      setNewBrand("");
      setNewSlug("");
      setNewAdminUser("");
      setNewAdminPass("");
      setNewGeofenceEnabled(true);
      setSeedStarter(false);
    } catch {
      // Offline fallback: save locally and queue for auto-sync on reconnect
      queuePendingCampaign(payload);
      setIsCreateOpen(false);
      setNewName("");
      setNewBrand("");
      setNewSlug("");
      setNewAdminUser("");
      setNewAdminPass("");
      setNewGeofenceEnabled(true);
      setSeedStarter(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleCampaignGeofence(c: Campaign) {
    const nextEnabled = c.geofenceEnabled === false ? true : false;
    const optimistic: Campaign = { ...c, geofenceEnabled: nextEnabled, updatedAt: Date.now() };
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(optimistic),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        applyAndCacheCampaigns(
          campaigns.map((item) => (item.id === data.campaign.id ? data.campaign : item))
        );
        if (managingCampaign?.id === data.campaign.id) {
          setManagingCampaign(data.campaign);
        }
      } else {
        queuePendingCampaign(optimistic);
      }
    } catch {
      queuePendingCampaign(optimistic);
      if (managingCampaign?.id === optimistic.id) {
        setManagingCampaign(optimistic);
      }
    }
  }

  function useCurrentDeviceGps() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setGpsFetching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const acc = Math.round(pos.coords.accuracy || 0);
        setStoreLat(pos.coords.latitude.toFixed(6));
        setStoreLng(pos.coords.longitude.toFixed(6));
        setGpsFetching(false);
        if (acc > 35) {
          alert(
            `⚠️ Warning: Current GPS accuracy is coarse (±${acc}m). For reliable store calibration, step outdoors until accuracy is ≤ 20m.`
          );
        }
      },
      () => {
        setGpsFetching(false);
        alert("Could not read browser GPS.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function handleAddStoreToCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!managingCampaign || !storeName.trim()) return;

    const geofenceRequired = managingCampaign.geofenceEnabled !== false;
    const rawLat = storeLat.trim();
    const rawLng = storeLng.trim();
    const hasCoordsInput = rawLat !== "" || rawLng !== "";

    const parsedLat = hasCoordsInput ? Number(rawLat) : 6.5244;
    const parsedLng = hasCoordsInput ? Number(rawLng) : 3.3792;
    const coordsValid =
      Number.isFinite(parsedLat) &&
      Number.isFinite(parsedLng) &&
      parsedLat >= -90 &&
      parsedLat <= 90 &&
      parsedLng >= -180 &&
      parsedLng <= 180 &&
      !(Math.abs(parsedLat) < 0.0001 && Math.abs(parsedLng) < 0.0001);

    if ((geofenceRequired && (!hasCoordsInput || !coordsValid)) || (hasCoordsInput && !coordsValid)) {
      alert("Please enter valid GPS latitude and longitude coordinates for this venue.");
      return;
    }

    setSavingStore(true);

    const generatedCode = (storeCode || storeName)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-");

    const newStore: StoreLocation = {
      id: generatedCode,
      storeCode: generatedCode,
      name: storeName.trim(),
      state: storeState,
      address: storeAddress.trim(),
      lat: parsedLat,
      lng: parsedLng,
      geofenceRadius: Math.min(500, Math.max(50, Number(storeRadius) || 200)),
      baName: baName.trim() || undefined,
      baUsername: baUsername.trim().toLowerCase() || undefined,
      baPassword: baPassword.trim() || "1234",
      pin: baPassword.trim() || "1234",
      baPhone: baPhone.trim() || undefined,
      isActive: true,
    };

    const updatedStores = [
      newStore,
      ...(managingCampaign.stores || []).filter(
        (s) => (s.storeCode || s.id) !== generatedCode
      ),
    ];

    const optimistic: Campaign = {
      ...managingCampaign,
      stores: updatedStores,
      updatedAt: Date.now(),
    };

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(optimistic),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setManagingCampaign(data.campaign);
        applyAndCacheCampaigns(
          campaigns.map((c) => (c.id === data.campaign.id ? data.campaign : c))
        );
        setStoreName("");
        setStoreCode("");
        setStoreAddress("");
        setBaName("");
        setBaUsername("");
        setBaPhone("");
      } else {
        alert(data.error || "Failed to save location.");
      }
    } catch {
      const queued = queuePendingCampaign(optimistic);
      setManagingCampaign(queued);
      setStoreName("");
      setStoreCode("");
      setStoreAddress("");
      setBaName("");
      setBaUsername("");
      setBaPhone("");
    } finally {
      setSavingStore(false);
    }
  }

  async function handleDeleteStore(codeToDelete: string) {
    if (!managingCampaign) return;
    if (!confirm("Remove this location from the event?")) return;
    const updatedStores = (managingCampaign.stores || []).filter(
      (s) => (s.storeCode || s.id) !== codeToDelete
    );
    const optimistic: Campaign = {
      ...managingCampaign,
      stores: updatedStores,
      updatedAt: Date.now(),
    };
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(optimistic),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setManagingCampaign(data.campaign);
        applyAndCacheCampaigns(
          campaigns.map((c) => (c.id === data.campaign.id ? data.campaign : c))
        );
      }
    } catch {
      const queued = queuePendingCampaign(optimistic);
      setManagingCampaign(queued);
    }
  }

  function copyLink(slug: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3001";
    navigator.clipboard.writeText(`${origin}/?c=${slug}`);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(""), 2000);
  }

  return (
    <div className="min-h-screen bg-[#080E1A] text-slate-100 flex flex-col">
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-40 bg-[#0B1528]/90 backdrop-blur-xl border-b border-white/10 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-black shadow-lg shadow-teal-500/20">
              <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-white text-base tracking-tight">
                  Field Operations · Superadmin Console
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Multi-Brand HQ
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Create & manage brand activations, geofenced venues, and supervisor/BA credentials
              </p>
            </div>
          </div>

          {isAuthenticated && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-black text-black bg-teal-400 hover:bg-teal-300 flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-teal-500/20"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>New Brand Event</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {!isAuthenticated ? (
          /* ── Superadmin Username & Password Login ── */
          <div className="max-w-md mx-auto my-10 bg-white/[0.03] border border-white/10 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-5 mx-auto">
              <Lock className="w-6 h-6 text-teal-400" />
            </div>

            <div className="text-center mb-6">
              <h2 className="text-xl font-black text-white tracking-tight">
                Superadmin Sign In
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Sign in with your agency master credentials to create brand events and manage field teams.
              </p>
            </div>

            <form onSubmit={handleSuperAdminLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. superadmin"
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
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs text-center font-semibold">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-black shadow-lg shadow-teal-500/20 transition cursor-pointer disabled:opacity-50"
              >
                {authLoading ? "Verifying Credentials..." : "Sign In to Superadmin"}
              </button>

              <div className="pt-2 text-center border-t border-white/10">
                <Link
                  href="/superadmin/setup"
                  className="text-xs text-teal-400 hover:text-teal-300 underline font-semibold"
                >
                  First-time deployment? Set up Superadmin password →
                </Link>
              </div>
            </form>
          </div>
        ) : (
          /* ── Authenticated Multi-Brand Campaign Directory ── */
          <div className="space-y-6">
            {(!isOnline || Object.keys(pendingCampaigns).length > 0) && (
              <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-between gap-3 flex-wrap text-xs">
                <div className="flex items-center gap-2 text-amber-200 font-bold">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isOnline ? "bg-teal-400" : "bg-amber-400 animate-pulse"
                    }`}
                  />
                  <span>
                    {!isOnline
                      ? `Offline Mode · Changes are saved locally (${Object.keys(pendingCampaigns).length} pending cloud sync)`
                      : `${Object.keys(pendingCampaigns).length} offline event change(s) ready to sync across board`}
                  </span>
                </div>
                {isOnline && Object.keys(pendingCampaigns).length > 0 && (
                  <button
                    type="button"
                    disabled={syncingPending}
                    onClick={() => loadCampaigns()}
                    className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-[11px] uppercase tracking-wider cursor-pointer"
                  >
                    {syncingPending ? "Syncing..." : "Sync Now"}
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-black text-white">
                  Active Brand Events & Field Campaigns ({campaigns.length})
                </h2>
                <p className="text-xs text-white/50">
                  Each brand event gets its own dedicated BA check-in URL, 200m geofenced store list, and supervisor login.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadCampaigns()}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white/70 hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            {loading ? (
              <div className="py-16 text-center text-xs text-white/40 flex flex-col items-center gap-2 font-mono">
                <span className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                <span>Loading brand events...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {campaigns.map((c) => {
                  const slug = c.id || "golden-morn";
                  const storeCount = (c.stores || []).length;
                  const isHospital = c.activationType === "hospital";

                  return (
                    <div
                      key={slug}
                      className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 hover:border-teal-500/40 transition-all flex flex-col justify-between space-y-4 shadow-xl"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border ${
                              isHospital
                                ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
                                : "bg-teal-500/15 text-teal-300 border-teal-500/30"
                            }`}
                          >
                            {isHospital ? (
                              <>
                                <HeartPulse className="w-3 h-3" />
                                <span>Hospital / Clinic</span>
                              </>
                            ) : (
                              <>
                                <ShoppingBag className="w-3 h-3" />
                                <span>Retail Supermarket</span>
                              </>
                            )}
                          </span>
                          <span className="text-[11px] font-mono text-white/40">
                            ?c={slug}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-black text-white">{c.name}</h3>
                          <p className="text-xs text-teal-300 font-semibold">
                            {c.brandName || c.name}
                          </p>
                        </div>

                        <div className="p-3 rounded-2xl bg-black/30 border border-white/10 space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-white/50">Locations Assigned:</span>
                            <span className="font-mono font-bold text-white">{storeCount} venues</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-white/50">Geofence Rule:</span>
                            <button
                              type="button"
                              onClick={() => handleToggleCampaignGeofence(c)}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition cursor-pointer ${
                                c.geofenceEnabled !== false
                                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                                  : "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25"
                              }`}
                              title="Click to toggle GPS Geofence requirement ON or OFF for this event"
                            >
                              {c.geofenceEnabled !== false
                                ? "📍 ON (200m Fence)"
                                : "⚡ OFF (Direct Check-In)"}
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-white/50">Supervisor User:</span>
                            <span className="font-mono text-amber-300">{c.adminUsername || "supervisor"}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-white/50">Supervisor Pass:</span>
                            <span className="font-mono text-white/80">
                              {(c.adminPassword || c.adminPin || "").includes(":")
                                ? "•••••••• (PBKDF2)"
                                : c.adminPassword || c.adminPin || "2026"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setManagingCampaign(c)}
                            className="py-2.5 px-2.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            <span>Venues ({storeCount})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setQuestionsCampaign(c);
                              setDraftQuestions(
                                c.surveyQuestions && c.surveyQuestions.length > 0
                                  ? c.surveyQuestions
                                  : c.activationType === "hospital"
                                  ? DEFAULT_HOSPITAL_QUESTIONS
                                  : []
                              );
                            }}
                            className="py-2.5 px-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                            <span>Questions ({c.surveyQuestions?.length || (c.activationType === "hospital" ? DEFAULT_HOSPITAL_QUESTIONS.length : 0)})</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <Link
                            href={`/?c=${slug}`}
                            className="py-2 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-center text-white flex items-center justify-center gap-1"
                          >
                            <Smartphone className="w-3 h-3 text-teal-400" />
                            <span>BA App</span>
                          </Link>
                          <Link
                            href={`/dashboard?c=${slug}`}
                            className="py-2 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-center text-white flex items-center justify-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3 text-amber-400" />
                            <span>Ops Hub</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => copyLink(slug)}
                            className="py-2 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-white flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {copiedSlug === slug ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-300">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-white/60" />
                                <span>Copy URL</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── MODAL 1: CREATE NEW BRAND EVENT ── */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            className="max-w-lg w-full rounded-3xl bg-[#0B1528] border border-white/20 p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div>
                <h3 className="text-base font-black text-white">Create New Brand Field Event</h3>
                <p className="text-xs text-white/50">Set up a dedicated activation campaign with its own supervisor login</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-white/40 hover:text-white text-sm font-bold px-2"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateCampaign} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                    Event / Campaign Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pampers Hospital Outreach"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (!newSlug) {
                        setNewSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-|-$/g, "")
                        );
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs text-white bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                    Client / Brand Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Pampers (P&G)"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs text-white bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                    URL Slug (`/?c=...`)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. pampers-maternity"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono text-teal-300 bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1">
                    Default Survey Mode
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as SurveyType)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs text-white bg-slate-900 border border-white/15 focus:border-teal-400 focus:outline-none"
                  >
                    <option value="retail">🛍️ Retail Supermarket Sampling</option>
                    <option value="hospital">🏥 Hospital / Maternity Detailing</option>
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/10 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Supervisor Dashboard Login Credentials
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                      Supervisor Username
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. pampers_sup"
                      value={newAdminUser}
                      onChange={(e) => setNewAdminUser(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs font-mono text-white bg-white/5 border border-white/15"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                      Supervisor Password
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. pampers2026"
                      value={newAdminPass}
                      onChange={(e) => setNewAdminPass(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs font-mono text-white bg-white/5 border border-white/15"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-white/85 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newGeofenceEnabled}
                    onChange={(e) => setNewGeofenceEnabled(e.target.checked)}
                    className="rounded border-white/20 accent-teal-400"
                  />
                  <span>Enable GPS Geofence Verification (Require BAs to be on-site within radius)</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seedStarter}
                    onChange={(e) => setSeedStarter(e.target.checked)}
                    className="rounded border-white/20 accent-teal-400"
                  />
                  <span>Pre-load starter demo locations (can be edited or deleted anytime)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 text-white/70 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-teal-400 hover:bg-teal-300 text-black cursor-pointer disabled:opacity-50"
                >
                  {creating ? "Creating Event..." : "Create Brand Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: MANAGE STORES & BA CREDENTIALS FOR AN EVENT ── */}
      {managingCampaign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
          onClick={() => setManagingCampaign(null)}
        >
          <div
            className="max-w-4xl w-full rounded-3xl bg-[#0B1528] border border-white/20 p-6 space-y-5 shadow-2xl my-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base font-black text-white">
                  {managingCampaign.name} · Locations & BA Credentials
                </h3>
                <p className="text-xs text-white/50">
                  Add geofenced stores/hospitals (200m radius rule) and assign BA login credentials
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManagingCampaign(null)}
                className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold text-white/70 hover:text-white cursor-pointer"
              >
                Done
              </button>
            </div>

            {/* Add / Update Store Form */}
            <form
              onSubmit={handleAddStoreToCampaign}
              className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wider text-teal-300">
                  + Add / Update Venue & Assigned BA
                </p>
                <button
                  type="button"
                  onClick={useCurrentDeviceGps}
                  disabled={gpsFetching}
                  className="text-[11px] font-mono font-bold text-teal-300 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Navigation className="w-3 h-3" />
                  <span>{gpsFetching ? "Reading GPS..." : "📍 Fill My Current GPS"}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                    Store / Hospital Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Gbagada General Hospital"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs text-white bg-black/40 border border-white/15"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                    Location Code (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-generated if blank"
                    value={storeCode}
                    onChange={(e) => setStoreCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-mono text-white bg-black/40 border border-white/15"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                    State
                  </label>
                  <select
                    value={storeState}
                    onChange={(e) => setStoreState(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs text-white bg-slate-900 border border-white/15"
                  >
                    {NIGERIAN_STATES.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 10 Balegi Avenue, Island Estate, Magboro"
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs text-white bg-black/40 border border-white/15"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                    Latitude / Longitude {managingCampaign.geofenceEnabled === false && "(Optional)"}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      required={managingCampaign.geofenceEnabled !== false}
                      value={storeLat}
                      onChange={(e) => setStoreLat(e.target.value)}
                      placeholder="Lat"
                      className="w-full px-2 py-2 rounded-xl text-xs font-mono text-teal-300 bg-black/40 border border-white/15"
                    />
                    <input
                      type="text"
                      required={managingCampaign.geofenceEnabled !== false}
                      value={storeLng}
                      onChange={(e) => setStoreLng(e.target.value)}
                      placeholder="Lng"
                      className="w-full px-2 py-2 rounded-xl text-xs font-mono text-teal-300 bg-black/40 border border-white/15"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                    Geofence Radius (m)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={1000}
                    value={storeRadius}
                    onChange={(e) => setStoreRadius(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-mono text-white bg-black/40 border border-white/15"
                  />
                </div>
              </div>

              {/* Assigned BA Login Credentials */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2 border-t border-white/10">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                    Assigned BA Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Chidinma Okafor"
                    value={baName}
                    onChange={(e) => setBaName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs text-white bg-black/40 border border-white/15"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                    BA Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 08031234567"
                    value={baPhone}
                    onChange={(e) => setBaPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-mono text-white bg-black/40 border border-white/15"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                    BA Username / Staff ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. chidinma"
                    value={baUsername}
                    onChange={(e) => setBaUsername(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-mono text-amber-300 bg-black/40 border border-white/15"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                    BA Password / PIN
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1234"
                    value={baPassword}
                    onChange={(e) => setBaPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs font-mono text-white bg-black/40 border border-white/15"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={savingStore || !storeName.trim()}
                    className="w-full py-2 px-4 rounded-xl bg-teal-400 hover:bg-teal-300 text-black font-black text-xs cursor-pointer disabled:opacity-50"
                  >
                    {savingStore ? "Saving..." : "+ Save Location"}
                  </button>
                </div>
              </div>
            </form>

            {/* Existing Stores Table */}
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-white/[0.04] border-b border-white/10 text-[10px] font-mono uppercase text-white/50">
                    <th className="py-2.5 px-3">Venue</th>
                    <th className="py-2.5 px-3">GPS & Radius</th>
                    <th className="py-2.5 px-3">Assigned BA</th>
                    <th className="py-2.5 px-3">BA Login (User / Pass)</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(managingCampaign.stores || []).map((s) => {
                    const code = s.storeCode || s.id || "";
                    return (
                      <tr key={code} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-white">{s.name}</div>
                          <div className="text-[10px] text-white/50">{s.address || s.state}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-teal-300">
                          {s.lat?.toFixed(4)}, {s.lng?.toFixed(4)} · <span className="text-white">{s.geofenceRadius || 200}m</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-white font-medium">{s.baName || "Any BA"}</div>
                          {s.baPhone && <div className="text-[10px] font-mono text-white/40">{s.baPhone}</div>}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          <span className="text-amber-300">{s.baUsername || code}</span>
                          <span className="text-white/40"> / </span>
                          <span className="text-white/80">
                            {(s.baPassword || s.pin || "").includes(":")
                              ? "•••• (Hashed)"
                              : s.baPassword || s.pin || "1234"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteStore(code)}
                            className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 cursor-pointer"
                            title="Delete store"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: CONFIGURE SURVEY QUESTIONS ── */}
      {questionsCampaign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
          onClick={() => setQuestionsCampaign(null)}
        >
          <div
            className="max-w-3xl w-full rounded-3xl bg-[#0B1528] border border-white/20 p-6 space-y-5 shadow-2xl my-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 gap-3 flex-wrap">
              <div>
                <h3 className="text-base font-black text-white">
                  {questionsCampaign.name} · Survey Questions
                </h3>
                <p className="text-xs text-white/50">
                  Configure the exact questions BAs collect on-site during this activation
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDraftQuestions(DEFAULT_HOSPITAL_QUESTIONS)}
                  className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Load Hospital (ANC/IMC + Consent)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionsCampaign(null)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold text-white/70 hover:text-white cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Existing / Draft Questions List */}
            <div className="space-y-2.5">
              {draftQuestions.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-dashed border-white/15 text-center text-xs text-white/50">
                  No custom questions configured yet. The default {questionsCampaign.activationType || "retail"} form will be used unless you add questions below or load the Hospital template.
                </div>
              ) : (
                draftQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/25">
                            #{idx + 1} · {q.type}
                          </span>
                          <label className="flex items-center gap-1 text-[10px] text-white/60 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(q.required)}
                              onChange={(e) => {
                                const next = [...draftQuestions];
                                next[idx] = { ...q, required: e.target.checked };
                                setDraftQuestions(next);
                              }}
                            />
                            <span>Required</span>
                          </label>
                          {q.type === "text" && (
                            <label className="flex items-center gap-1 text-[10px] text-white/60 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(q.autoFillStoreName)}
                                onChange={(e) => {
                                  const next = [...draftQuestions];
                                  next[idx] = { ...q, autoFillStoreName: e.target.checked };
                                  setDraftQuestions(next);
                                }}
                              />
                              <span>Auto-fill Hospital/Store Name</span>
                            </label>
                          )}
                        </div>
                        <input
                          type="text"
                          value={q.label}
                          onChange={(e) => {
                            const next = [...draftQuestions];
                            next[idx] = { ...q, label: e.target.value };
                            setDraftQuestions(next);
                          }}
                          className="w-full px-3 py-2 rounded-xl text-xs text-white bg-black/40 border border-white/15 focus:border-teal-400 focus:outline-none"
                        />
                        {(q.type === "select" || q.type === "radio_consent") && (
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-white/40 mb-1">
                              Options (one per line or comma-separated)
                            </label>
                            <textarea
                              rows={2}
                              value={(q.options || []).join("\n")}
                              onChange={(e) => {
                                const next = [...draftQuestions];
                                const opts = e.target.value
                                  .split(/\n|,/)
                                  .map((o) => o.trim())
                                  .filter(Boolean);
                                next[idx] = { ...q, options: opts };
                                setDraftQuestions(next);
                              }}
                              className="w-full px-3 py-1.5 rounded-xl text-xs text-amber-200 bg-black/40 border border-white/15 focus:border-teal-400 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftQuestions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 cursor-pointer"
                        title="Remove question"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add New Question Form */}
            <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-teal-300">
                + Add Question
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    placeholder="Question label (e.g. CLINIC or MOTHER'S NAME)"
                    value={newQLabel}
                    onChange={(e) => setNewQLabel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs text-white bg-black/40 border border-white/15"
                  />
                </div>
                <select
                  value={newQType}
                  onChange={(e) => setNewQType(e.target.value as SurveyQuestionType)}
                  className="px-3 py-2 rounded-xl text-xs text-white bg-slate-900 border border-white/15"
                >
                  <option value="text">Text (Editable)</option>
                  <option value="tel">Phone Number</option>
                  <option value="select">Dropdown (Select)</option>
                  <option value="radio_consent">Tick / Consent Options</option>
                </select>
              </div>
              {(newQType === "select" || newQType === "radio_consent") && (
                <input
                  type="text"
                  placeholder="Comma-separated options (e.g. ANC, IMC)"
                  value={newQOptions}
                  onChange={(e) => setNewQOptions(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs text-amber-200 bg-black/40 border border-white/15"
                />
              )}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs text-white/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newQRequired}
                    onChange={(e) => setNewQRequired(e.target.checked)}
                  />
                  <span>Required field</span>
                </label>
                <button
                  type="button"
                  disabled={!newQLabel.trim()}
                  onClick={() => {
                    const slugId = newQLabel
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "_")
                      .replace(/^_|_$/g, "")
                      .slice(0, 40) || `q_${Date.now()}`;
                    const opts =
                      newQType === "select" || newQType === "radio_consent"
                        ? newQOptions
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : undefined;
                    setDraftQuestions((prev) => [
                      ...prev,
                      {
                        id: `${slugId}_${prev.length + 1}`,
                        label: newQLabel.trim(),
                        type: newQType,
                        required: newQRequired,
                        options: opts,
                      },
                    ]);
                    setNewQLabel("");
                    setNewQOptions("");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white cursor-pointer disabled:opacity-40"
                >
                  + Add to Form
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setQuestionsCampaign(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 text-white/70 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingQuestions}
                onClick={async () => {
                  setSavingQuestions(true);
                  try {
                    const res = await fetch("/api/campaigns", {
                      method: "POST",
                      headers: getAuthHeaders(),
                      body: JSON.stringify({
                        ...questionsCampaign,
                        surveyQuestions: draftQuestions,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      setCampaigns((prev) =>
                        prev.map((c) => (c.id === data.campaign.id ? data.campaign : c))
                      );
                      setQuestionsCampaign(null);
                    } else {
                      alert(data.error || "Failed to save survey questions.");
                    }
                  } catch {
                    alert("Network error while saving survey questions.");
                  } finally {
                    setSavingQuestions(false);
                  }
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-teal-400 hover:bg-teal-300 text-black cursor-pointer disabled:opacity-50"
              >
                {savingQuestions ? "Saving Questions..." : "Save Survey Questions"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
