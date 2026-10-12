"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  MapPin, ShieldCheck, CheckCircle2, AlertTriangle,
  Camera, Clock, RefreshCw, X, ChevronRight, Navigation,
  Smartphone, Award, User, Phone, LogOut, Plus, Minus,
} from "lucide-react";
import type { Campaign, StoreLocation, CheckInRecord, GeoPoint } from "@/lib/types";
import { getCampaign } from "@/lib/repository";
import { evaluateGeofence, formatDistance } from "@/lib/geo";

type DemoMode = "real" | "on_site" | "out_of_bounds";

function CheckInContent() {
  const searchParams = useSearchParams();
  const campaignSlug = searchParams.get("c") || "golden-morn";

  // Campaign & Store state
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadingCampaign, setLoadingCampaign] = useState(true);
  const [selectedStore, setSelectedStore] = useState<StoreLocation | null>(null);

  // Form inputs
  const [baName, setBaName] = useState("");
  const [baPhone, setBaPhone] = useState("");
  const [baPin, setBaPin] = useState("");

  // Demo simulator state
  const [demoMode, setDemoMode] = useState<DemoMode>("real");

  // GPS / Location state
  const [coords, setCoords] = useState<GeoPoint | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");

  // Selfie / Photo state
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active shift state (persisted to localStorage)
  const [activeShift, setActiveShift] = useState<CheckInRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [shiftElapsed, setShiftElapsed] = useState("");

  // Sample counter incrementing state
  const [counterLoading, setCounterLoading] = useState(false);

  // ── Load Campaign ──
  useEffect(() => {
    async function load() {
      try {
        setLoadingCampaign(true);
        const data = await getCampaign(campaignSlug);
        setCampaign(data);

        // Check if BA already has an active shift saved locally
        const cached = localStorage.getItem(`active_shift_${campaignSlug}`);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            setActiveShift(parsed);
          } catch {}
        }
      } catch (err) {
        console.error("Failed to load campaign for check-in:", err);
      } finally {
        setLoadingCampaign(false);
      }
    }
    load();
  }, [campaignSlug]);

  // ── Shift Elapsed Timer ──
  useEffect(() => {
    if (!activeShift?.checkInTime) return;

    function updateTimer() {
      const start = new Date(activeShift!.checkInTime).getTime();
      const now = Date.now();
      const diffMs = Math.max(0, now - start);

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

      if (hours > 0) {
        setShiftElapsed(`${hours}h ${mins}m`);
      } else {
        setShiftElapsed(`${mins}m ${secs}s`);
      }
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeShift]);

  // ── Acquire GPS Coordinates (or apply demo mode) ──
  function acquireLocation(mode: DemoMode = demoMode, store = selectedStore) {
    setGpsError("");

    if (mode === "on_site") {
      // Simulate on-site: 25 meters offset from store target
      const lat = store?.lat ?? 6.4358;
      const lng = store?.lng ?? 3.4831;
      setCoords({
        latitude: lat + 0.00015,
        longitude: lng + 0.00012,
        accuracy: 8,
      });
      return;
    }

    if (mode === "out_of_bounds") {
      // Simulate 600m away
      const lat = store?.lat ?? 6.4358;
      const lng = store?.lng ?? 3.4831;
      setCoords({
        latitude: lat + 0.0055,
        longitude: lng + 0.0048,
        accuracy: 15,
      });
      return;
    }

    // Real device GPS
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGpsError("Geolocation is not supported by your mobile browser.");
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(err.message || "Could not retrieve GPS location.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  // Auto-acquire location when store changes
  useEffect(() => {
    if (selectedStore && !activeShift) {
      acquireLocation(demoMode, selectedStore);
    }
  }, [selectedStore, demoMode]);

  // Handle Photo capture
  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  // ── Geofence Evaluation ──
  const storeTarget: GeoPoint = {
    latitude: selectedStore?.lat ?? (coords?.latitude || 6.4358),
    longitude: selectedStore?.lng ?? (coords?.longitude || 3.4831),
  };

  const geofence = coords
    ? evaluateGeofence(coords, storeTarget, selectedStore?.geofenceRadius || 100)
    : null;

  // ── Submit Check-In ──
  async function handleCheckInSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStore || !baName.trim() || !coords) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check_in",
          campaignId: campaignSlug,
          storeCode: selectedStore.storeCode || (selectedStore as any).code || selectedStore.id || "",
          baName: baName.trim(),
          baPhone: baPhone.trim(),
          pin: baPin.trim(),
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          photoUrl: photoDataUrl || undefined,
          isSimulated: demoMode !== "real",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmitError(data.error || "Check-in failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setActiveShift(data.checkIn);
      localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(data.checkIn));
    } catch (err: any) {
      console.error("Checkin submit error:", err);
      setSubmitError("Network error. Please check internet connection.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Increment / Decrement Shift Counter (+1 Sample) ──
  async function handleCounterDelta(delta: number) {
    if (!activeShift) return;
    setCounterLoading(true);

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sample_counter",
          checkInId: activeShift.id,
          delta,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const updated = { ...activeShift, samplesLogged: data.samplesLogged };
        setActiveShift(updated);
        localStorage.setItem(`active_shift_${campaignSlug}`, JSON.stringify(updated));
      }
    } catch (err) {
      console.error("Counter update failed:", err);
    } finally {
      setCounterLoading(false);
    }
  }

  // ── End Shift / Check Out ──
  async function handleCheckOutSubmit() {
    if (!activeShift) return;
    if (!confirm("Are you sure you want to end your shift and check out for today?")) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check_out",
          checkInId: activeShift.id,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.removeItem(`active_shift_${campaignSlug}`);
        setActiveShift(null);
        setSelectedStore(null);
        setPhotoDataUrl(null);
        alert(`Shift completed! Total hours: ${data.checkIn.hoursWorked || 0} hrs. Samples: ${data.checkIn.samplesLogged || 0}`);
      }
    } catch (err) {
      console.error("Checkout failed:", err);
      alert("Failed to submit check-out. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingCampaign) {
    return (
      <div className="min-h-screen bg-[#080E1A] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-white/50 tracking-wider uppercase font-mono">Loading Check-In...</p>
        </div>
      </div>
    );
  }

  const stores = campaign?.stores || [];

  return (
    <div className="min-h-screen bg-[#080E1A] text-white flex flex-col justify-between selection:bg-teal-500 selection:text-black">
      {/* ── Demo Simulator Bar ── */}
      <div className="bg-slate-900/90 border-b border-white/10 px-3 py-2 flex items-center justify-between gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          <span className="font-bold text-white/80">Demo Simulator:</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setDemoMode("on_site"); acquireLocation("on_site"); }}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
              demoMode === "on_site"
                ? "bg-emerald-500 text-black shadow-sm"
                : "bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            📍 On-Site (25m)
          </button>
          <button
            type="button"
            onClick={() => { setDemoMode("out_of_bounds"); acquireLocation("out_of_bounds"); }}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
              demoMode === "out_of_bounds"
                ? "bg-amber-500 text-black shadow-sm"
                : "bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            🚶 600m Away
          </button>
          <button
            type="button"
            onClick={() => { setDemoMode("real"); acquireLocation("real"); }}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
              demoMode === "real"
                ? "bg-teal-500 text-black shadow-sm"
                : "bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            🛰️ Real GPS
          </button>
          <Link
            href={`/dashboard?c=${campaignSlug}`}
            className="ml-1 sm:ml-2 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 transition-all flex items-center gap-1"
          >
            📊 Ops Hub
          </Link>
        </div>
      </div>

      {/* ── Main Content Container ── */}
      <main className="max-w-md w-full mx-auto p-4 sm:p-5 flex-1 flex flex-col justify-center">

        {/* ── Header ── */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-mono font-semibold mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Field Attendance & Geofence</span>
          </div>
          <h1
            className="text-2xl font-black tracking-tight text-white"
            style={{ fontFamily: "Rubik, sans-serif" }}
          >
            {campaign?.name || "Golden Morn"}
          </h1>
          <p className="text-xs text-white/50 mt-1">
            Brand Ambassador Daily Shift Verification
          </p>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            VIEW A: ACTIVE SHIFT PAD (Already Checked In)
           ───────────────────────────────────────────────────────────── */}
        {activeShift ? (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-5 rounded-3xl bg-white/[0.03] border border-teal-500/30 backdrop-blur-xl shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 w-28 h-28 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
                    Active Shift
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono text-white/70">
                  <Clock className="w-3.5 h-3.5 text-teal-400" />
                  <span>{shiftElapsed}</span>
                </div>
              </div>

              {/* Store & BA Details */}
              <div className="py-3 space-y-1">
                <h2 className="text-lg font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                  {activeShift.storeName}
                </h2>
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <User className="w-3.5 h-3.5 text-white/40" />
                  <span>{activeShift.baName}</span>
                  <span>·</span>
                  <span className="font-mono text-teal-400">{activeShift.storeCode}</span>
                </div>
                <div className="pt-1 flex items-center gap-2 text-[11px] font-mono text-white/50">
                  <span>Checked In: {new Date(activeShift.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span>·</span>
                  <span className="text-emerald-400">GPS: {activeShift.distanceMeters}m</span>
                </div>
              </div>

              {/* ── Sample / Engagement Counter Pad ── */}
              <div className="my-4 p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-center space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-white/60">
                  Samples / Engagements Logged
                </p>
                <div className="text-5xl font-black text-white font-mono tracking-tight">
                  {activeShift.samplesLogged ?? 0}
                </div>
                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={counterLoading || (activeShift.samplesLogged || 0) <= 0}
                    onClick={() => handleCounterDelta(-1)}
                    className="w-12 h-12 rounded-2xl bg-white/5 border border-white/15 text-white flex items-center justify-center hover:bg-white/10 transition-all disabled:opacity-30 cursor-pointer"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    disabled={counterLoading}
                    onClick={() => handleCounterDelta(1)}
                    className="px-6 h-12 rounded-2xl bg-teal-500 hover:bg-teal-400 text-black font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-teal-500/20 active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-5 h-5 stroke-[3]" />
                    <span>Log Sample (+1)</span>
                  </button>
                </div>
              </div>

              {/* End Shift Button */}
              <button
                type="button"
                disabled={submitting}
                onClick={handleCheckOutSubmit}
                className="w-full py-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                <span>End Shift & Check Out</span>
              </button>
            </div>
          </div>
        ) : (
          /* ─────────────────────────────────────────────────────────────
             VIEW B: CHECK-IN FORM (Not Yet Checked In)
             ───────────────────────────────────────────────────────────── */
          <form onSubmit={handleCheckInSubmit} className="space-y-4">
            <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-2xl space-y-4">

              {/* Error Banner */}
              {submitError && (
                <div className="p-3 rounded-2xl text-xs font-semibold bg-red-500/15 border border-red-500/30 text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* 1. Pick Assigned Store */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1.5">
                  1. Select Assigned Store <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={selectedStore ? (selectedStore.storeCode || (selectedStore as any).code || selectedStore.id || "") : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    const st = stores.find((s) => (s.storeCode || (s as any).code || s.id || "") === val);
                    setSelectedStore(st || null);
                    if (st?.baName && !baName) setBaName(st.baName);
                    if (st?.baPhone && !baPhone) setBaPhone(st.baPhone);
                  }}
                  className="w-full px-3.5 py-3 rounded-2xl text-xs text-white bg-slate-900 border border-white/15 focus:border-teal-400 focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">-- Choose your store location --</option>
                  {stores.map((s) => {
                    const code = s.storeCode || (s as any).code || s.id || "";
                    const locationLabel = s.state || (s as any).city || "";
                    return (
                      <option key={s.id || code} value={code} className="bg-slate-900 text-white py-1">
                        {s.name} {locationLabel ? `· ${locationLabel}` : ""} ({code})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 2. BA Identity & PIN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1">
                    BA Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chidinma Okonkwo"
                    value={baName}
                    onChange={(e) => setBaName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs text-white bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1">
                    Store Access PIN
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="1234"
                    value={baPin}
                    onChange={(e) => setBaPin(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono tracking-widest text-amber-300 text-center bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Phone (Optional) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 08012345678"
                  value={baPhone}
                  onChange={(e) => setBaPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs text-white bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none"
                />
              </div>

              {/* 3. Live Geofence Status Card */}
              {selectedStore && (
                <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/60 flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-teal-400" />
                      Geofence Status
                    </span>
                    <button
                      type="button"
                      disabled={gpsLoading}
                      onClick={() => acquireLocation(demoMode, selectedStore)}
                      className="text-[10px] text-teal-300 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${gpsLoading ? "animate-spin" : ""}`} />
                      <span>Refresh GPS</span>
                    </button>
                  </div>

                  {gpsLoading ? (
                    <div className="py-2 text-center text-xs text-white/50 flex items-center justify-center gap-2">
                      <span className="w-3 h-3 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                      <span>Acquiring satellite lock...</span>
                    </div>
                  ) : gpsError ? (
                    <p className="text-xs text-red-400">{gpsError}</p>
                  ) : geofence ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-white/60">Distance to Store:</span>
                        <span className="font-bold text-white">{formatDistance(geofence.distance)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-white/60">Accuracy Tolerance:</span>
                        <span className="text-white/70">±{coords?.accuracy || 10}m</span>
                      </div>

                      {/* Evaluation Badge */}
                      <div className="pt-1">
                        {geofence.status === "verified" ? (
                          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                            <span>🟢 On-Site Verified ({formatDistance(geofence.distance)} away)</span>
                          </div>
                        ) : geofence.status === "drift" ? (
                          <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                            <span>🟡 Indoor Mall Drift Accepted ({formatDistance(geofence.distance)})</span>
                          </div>
                        ) : (
                          <div className="p-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
                            <span>🔴 Outside Geofence ({formatDistance(geofence.distance)} away)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* 4. Morning Photo Proof (Selfie / Storefront) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1.5">
                  Arrival Photo Proof (Selfie or Storefront)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  ref={fileInputRef}
                  onChange={handlePhotoCapture}
                  className="hidden"
                />

                {photoDataUrl ? (
                  <div className="relative rounded-2xl overflow-hidden border border-teal-500/30 bg-black/40 p-2 flex items-center gap-3">
                    <img
                      src={photoDataUrl}
                      alt="Arrival Proof"
                      className="w-14 h-14 object-cover rounded-xl border border-white/20"
                    />
                    <div className="flex-1 min-w-0 text-xs">
                      <p className="font-bold text-white flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Photo Captured
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[11px] text-teal-300 hover:underline mt-0.5"
                      >
                        Retake Photo
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhotoDataUrl(null)}
                      className="p-1 rounded-full text-white/40 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 rounded-2xl border border-dashed border-white/20 hover:border-teal-400/50 bg-white/[0.02] text-white/60 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-teal-400" />
                    <span>Take Morning Arrival Photo</span>
                  </button>
                )}
              </div>

              {/* Submit Check-In Button */}
              <button
                type="submit"
                disabled={submitting || !selectedStore || !baName.trim() || !coords}
                className="w-full py-3.5 rounded-2xl bg-teal-500 hover:bg-teal-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl shadow-teal-500/20 disabled:opacity-40 cursor-pointer active:scale-[0.99]"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Verifying On-Site Attendance...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Check In & Start Shift</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-4 text-[10px] text-white/30 font-mono">
        Field Operations Verification Engine · Active Campaign: {campaignSlug}
      </footer>
    </div>
  );
}

export default function CheckInPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#080E1A] text-white flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-white/50 tracking-wider uppercase font-mono">Loading Check-In...</p>
          </div>
        </div>
      }
    >
      <CheckInContent />
    </React.Suspense>
  );
}
