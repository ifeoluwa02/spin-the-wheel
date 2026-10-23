"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import confetti from "canvas-confetti";
import {
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Camera,
  RefreshCw,
  Search,
  Volume2,
  VolumeX,
  Users,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { EventItem, AttendeeRegistration, CheckinResult } from "@/lib/types";
import { INITIAL_EVENTS } from "@/lib/repository";
import { playSuccessChime, playWarningBuzz } from "@/lib/audio";

export default function ZeroClickScannerPage() {
  const [events, setEvents] = useState<EventItem[]>(INITIAL_EVENTS);
  const [selectedEventId, setSelectedEventId] = useState<string>(INITIAL_EVENTS[0].id);

  // Scanner state
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cooldownCountdown, setCooldownCountdown] = useState<number | null>(null);

  // Scan Result Feedback Overlay
  const [lastScanResult, setLastScanResult] = useState<CheckinResult | null>(null);
  const [recentAdmissions, setRecentAdmissions] = useState<AttendeeRegistration[]>([]);

  // Manual fallback input
  const [manualCode, setManualCode] = useState("");
  const [isManualChecking, setIsManualChecking] = useState(false);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const readerElementId = "qr-reader-container";

  // Load events
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
      } catch (e) {
        console.warn("Using fallback events:", e);
      }
    }
    loadEvents();
  }, []);

  const activeEvent = events.find((e) => e.id === selectedEventId) || events[0];

  // Process a scanned QR string
  const handleDecodedCode = useCallback(
    async (decodedText: string) => {
      // Guard against duplicate triggers during processing cooldown
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        const res = await fetch("/api/admit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrData: decodedText,
            eventId: selectedEventId,
          }),
        });

        const result: CheckinResult = await res.json();
        setLastScanResult(result);

        if (result.success && result.code === "ADMITTED") {
          if (soundEnabled) playSuccessChime();
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.5 },
          });
          if (result.attendee) {
            setRecentAdmissions((prev) => [result.attendee!, ...prev.slice(0, 9)]);
          }
        } else {
          // Warning or Error
          if (soundEnabled) playWarningBuzz();
        }

        // Start 1.8s automatic cooldown timer before scanning resumes
        let secondsLeft = 2;
        setCooldownCountdown(secondsLeft);

        const interval = setInterval(() => {
          secondsLeft -= 1;
          if (secondsLeft <= 0) {
            clearInterval(interval);
            setCooldownCountdown(null);
            setLastScanResult(null);
            isProcessingRef.current = false;
          } else {
            setCooldownCountdown(secondsLeft);
          }
        }, 800);
      } catch (err: unknown) {
        console.error("Admit processing failed:", err);
        setLastScanResult({
          success: false,
          code: "SERVER_ERROR",
          message: err instanceof Error ? err.message : "Network error during check-in",
        });
        setTimeout(() => {
          setLastScanResult(null);
          isProcessingRef.current = false;
        }, 2000);
      }
    },
    [selectedEventId, soundEnabled]
  );

  // Initialize Camera Scanner
  const startScanner = useCallback(async () => {
    setCameraError(null);
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(readerElementId);
      }

      const qrCode = html5QrCodeRef.current;
      if (qrCode.isScanning) {
        await qrCode.stop();
      }

      await qrCode.start(
        { facingMode: "environment" }, // Prefer back camera
        {
          fps: 15, // Smooth real-time scanning
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleDecodedCode(decodedText);
        },
        () => {
          // Frame without QR - ignore
        }
      );

      setIsScanning(true);
    } catch (err: unknown) {
      console.error("Failed to start camera scanner:", err);
      setCameraError(
        err instanceof Error
          ? err.message
          : "Camera access denied. Please grant camera permission or use manual check-in below."
      );
      setIsScanning(false);
    }
  }, [handleDecodedCode]);

  const stopScanner = useCallback(async () => {
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }
    } catch (err) {
      console.warn("Error stopping scanner:", err);
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Auto-start scanner on component mount
  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, [startScanner, stopScanner]);

  // Manual fallback submit
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setIsManualChecking(true);
    await handleDecodedCode(manualCode.trim());
    setManualCode("");
    setIsManualChecking(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Gate Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 sm:p-5 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              Zero-Click Continuous Scanner
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-white mt-1">
            Gate Admission Terminal
          </h1>
          <p className="text-xs text-slate-400">
            Hold attendee QR in camera frame. Admittance executes automatically with zero button taps.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sound toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
            title={soundEnabled ? "Mute audio chime" : "Enable audio chime"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Event Selector */}
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>
                {evt.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Scanner Viewport Area */}
      <div className="relative glass-card rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-black">
        {/* The HTML5 QR Code Container */}
        <div id={readerElementId} className="w-full min-h-[360px] sm:min-h-[460px] max-w-full overflow-hidden" />

        {/* Radar Scanning Line Animation overlay */}
        {isScanning && !lastScanResult && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {/* Target Crosshairs */}
            <div className="w-64 h-64 border-2 border-indigo-500/40 rounded-2xl relative">
              <span className="scanner-corner-tl" />
              <span className="scanner-corner-tr" />
              <span className="scanner-corner-bl" />
              <span className="scanner-corner-br" />

              {/* Glowing radar line moving vertically */}
              <div className="w-full h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_12px_#6366f1] animate-radar-sweep" />
            </div>
            <p className="mt-4 text-xs font-semibold text-indigo-300 tracking-wider uppercase bg-black/60 px-4 py-1.5 rounded-full backdrop-blur-md border border-indigo-500/30">
              Align QR Code Inside Box
            </p>
          </div>
        )}

        {/* Scan Status Feedback Overlay */}
        {lastScanResult && (
          <div
            className={`absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center backdrop-blur-md transition-all ${
              lastScanResult.code === "ADMITTED"
                ? "bg-emerald-950/90 text-white"
                : lastScanResult.code === "ALREADY_CHECKED_IN"
                ? "bg-amber-950/90 text-white"
                : "bg-rose-950/90 text-white"
            }`}
          >
            {lastScanResult.code === "ADMITTED" && (
              <div className="space-y-3 animate-in zoom-in-95 duration-200">
                <div className="w-20 h-20 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center mx-auto shadow-2xl shadow-emerald-500/50">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <div className="text-3xl font-black uppercase tracking-tight text-emerald-400">
                  ADMITTED
                </div>
                <div className="text-xl font-bold text-white">
                  {lastScanResult.attendee?.fullName}
                </div>
                <div className="inline-block px-3 py-1 rounded-full bg-white/20 text-xs font-bold uppercase tracking-wider text-white">
                  {lastScanResult.attendee?.ticketType} &bull; {lastScanResult.attendee?.id}
                </div>
                {lastScanResult.attendee?.organization && (
                  <div className="text-xs text-white/80">
                    {lastScanResult.attendee.organization}
                  </div>
                )}
                <div className="pt-2 text-xs font-mono text-emerald-200">
                  Resuming in {cooldownCountdown || 1}s...
                </div>
              </div>
            )}

            {lastScanResult.code === "ALREADY_CHECKED_IN" && (
              <div className="space-y-3 animate-in zoom-in-95 duration-200">
                <div className="w-20 h-20 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center mx-auto shadow-2xl shadow-amber-500/50">
                  <AlertTriangle className="w-12 h-12" />
                </div>
                <div className="text-2xl font-black uppercase tracking-tight text-amber-400">
                  ALREADY CHECKED IN
                </div>
                <div className="text-lg font-bold text-white">
                  {lastScanResult.attendee?.fullName}
                </div>
                <p className="text-xs text-amber-200">
                  Admitted previously at{" "}
                  <strong>
                    {new Date(lastScanResult.previousCheckinAt || "").toLocaleTimeString()}
                  </strong>
                </p>
                <div className="pt-2 text-xs font-mono text-amber-300">
                  Resuming in {cooldownCountdown || 1}s...
                </div>
              </div>
            )}

            {(lastScanResult.code === "INVALID_TICKET" ||
              lastScanResult.code === "WRONG_EVENT" ||
              lastScanResult.code === "SERVER_ERROR") && (
              <div className="space-y-3 animate-in zoom-in-95 duration-200">
                <div className="w-20 h-20 rounded-full bg-rose-500 text-white flex items-center justify-center mx-auto shadow-2xl shadow-rose-500/50">
                  <XCircle className="w-12 h-12" />
                </div>
                <div className="text-2xl font-black uppercase tracking-tight text-rose-400">
                  {lastScanResult.code === "WRONG_EVENT" ? "WRONG EVENT PASS" : "DENIED"}
                </div>
                <p className="text-sm text-rose-200 max-w-sm mx-auto">
                  {lastScanResult.message}
                </p>
                <div className="pt-2 text-xs font-mono text-rose-300">
                  Resuming in {cooldownCountdown || 1}s...
                </div>
              </div>
            )}
          </div>
        )}

        {/* Camera Permission / Error State */}
        {cameraError && (
          <div className="p-8 text-center space-y-4">
            <Camera className="w-12 h-12 text-amber-400 mx-auto" />
            <h3 className="text-base font-bold text-white">Camera Offline</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">{cameraError}</p>
            <button
              onClick={startScanner}
              className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Camera</span>
            </button>
          </div>
        )}
      </div>

      {/* Manual Input Fallback & Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
        {/* Manual search bar */}
        <div className="sm:col-span-8 glass-card p-4 rounded-2xl border border-slate-800">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Manual Check-In: Enter Ticket ID (e.g. TKT-LAG-1001)"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isManualChecking || !manualCode.trim()}
              className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shrink-0 transition-colors"
            >
              Admit
            </button>
          </form>
        </div>

        {/* Restart camera toggle */}
        <div className="sm:col-span-4 glass-card p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
          <div className="text-xs">
            <div className="font-semibold text-white">Camera Stream</div>
            <div className="text-[11px] text-slate-400">
              {isScanning ? "Active (15 fps)" : "Paused"}
            </div>
          </div>
          <button
            onClick={isScanning ? stopScanner : startScanner}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
              isScanning
                ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                : "bg-emerald-600 text-white hover:bg-emerald-500"
            }`}
          >
            {isScanning ? "Pause" : "Start"}
          </button>
        </div>
      </div>

      {/* Live Recent Admissions Activity Strip */}
      {recentAdmissions.length > 0 && (
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Recent Gate Admissions (Live Stream)</span>
            </span>
            <span className="text-[11px] font-mono text-emerald-400">
              {recentAdmissions.length} Admitted Today
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {recentAdmissions.map((att) => (
              <div
                key={att.id}
                className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-white truncate max-w-[150px]">
                    {att.fullName}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">{att.id}</div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold text-[10px] border border-emerald-500/20">
                    {att.ticketType}
                  </span>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(att.checkedInAt || "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
