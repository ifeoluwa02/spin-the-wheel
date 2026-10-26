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
  Lock,
  Clock,
  LogOut,
  KeyRound,
} from "lucide-react";
import { EventItem, AttendeeRegistration, CheckinResult } from "@/lib/types";
import { INITIAL_EVENTS } from "@/lib/repository";
import { playSuccessChime, playWarningBuzz } from "@/lib/audio";

interface GateScannerViewProps {
  initialEvent?: EventItem | null;
  lockedMode?: boolean;
  targetSlug?: string;
  sessionInfo?: {
    role: string;
    secondsRemaining?: number;
    onLock?: () => void;
    onReverify?: () => void;
  };
}

export function GateScannerView({
  initialEvent,
  lockedMode = false,
  targetSlug,
  sessionInfo,
}: GateScannerViewProps) {
  const [events, setEvents] = useState<EventItem[]>(
    initialEvent ? [initialEvent] : INITIAL_EVENTS
  );
  const [selectedEventId, setSelectedEventId] = useState<string>(
    initialEvent?.id || INITIAL_EVENTS[0].id
  );

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
      if (initialEvent && lockedMode) {
        setSelectedEventId(initialEvent.id);
        return;
      }
      try {
        const res = await fetch("/api/events");
        if (res.ok) {
          const data = await res.json();
          if (data.events && data.events.length > 0) {
            setEvents(data.events);
            if (targetSlug) {
              const matched = data.events.find(
                (e: EventItem) => e.slug === targetSlug || e.id === targetSlug
              );
              if (matched) {
                setSelectedEventId(matched.id);
                return;
              }
            }
            if (!initialEvent) {
              setSelectedEventId(data.events[0].id);
            }
          }
        }
      } catch (e) {
        console.warn("Using fallback events:", e);
      }
    }
    loadEvents();
  }, [initialEvent, lockedMode, targetSlug]);

  const activeEvent =
    (initialEvent && lockedMode)
      ? initialEvent
      : events.find((e) => e.id === selectedEventId) || initialEvent || events[0] || INITIAL_EVENTS[0];

  // Process a scanned QR string
  const handleDecodedCode = useCallback(
    async (decodedText: string) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        const res = await fetch("/api/admit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrData: decodedText,
            eventId: activeEvent.id,
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
          if (soundEnabled) playWarningBuzz();
        }

        // Automatic cooldown before resuming
        let secondsLeft = 2;
        setCooldownCountdown(secondsLeft);

        const countdownInterval = setInterval(() => {
          secondsLeft -= 1;
          if (secondsLeft <= 0) {
            clearInterval(countdownInterval);
            setCooldownCountdown(null);
            setLastScanResult(null);
            isProcessingRef.current = false;
          } else {
            setCooldownCountdown(secondsLeft);
          }
        }, 900);
      } catch (err) {
        console.error("Admit processing error:", err);
        setLastScanResult({
          success: false,
          code: "SERVER_ERROR",
          message: "Could not connect to admission server. Please check internet.",
        });
        setTimeout(() => {
          setLastScanResult(null);
          isProcessingRef.current = false;
        }, 2500);
      }
    },
    [activeEvent.id, soundEnabled]
  );

  // Initialize and start camera scanner
  const startScanner = useCallback(async () => {
    try {
      setCameraError(null);
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(readerElementId);
      }

      const qrCode = html5QrCodeRef.current;
      if (qrCode.isScanning) {
        return;
      }

      await qrCode.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleDecodedCode(decodedText);
        },
        () => {
          // Frame without QR
        }
      );

      setIsScanning(true);
    } catch (err: unknown) {
      console.error("Failed to start camera:", err);
      setCameraError(
        "Camera permission was denied or no camera device was found. Please allow camera permissions."
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

  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, [startScanner, stopScanner]);

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
      {/* Session Security Banner if protected */}
      {sessionInfo && (
        <div className="p-3 bg-blue-50/90 border border-blue-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-slate-800">
              Authenticated Operator ({sessionInfo.role})
            </span>
            <span className="text-slate-400">&bull;</span>
            <span className="text-slate-600 font-medium flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              PIN re-verify in:{" "}
              <strong className="text-blue-700">
                {sessionInfo.secondsRemaining ?? 60}s
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {sessionInfo.onReverify && (
              <button
                type="button"
                onClick={sessionInfo.onReverify}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-[11px] border border-slate-200 transition-colors flex items-center gap-1"
              >
                <KeyRound className="w-3 h-3 text-blue-600" />
                <span>Verify Now</span>
              </button>
            )}
            {sessionInfo.onLock && (
              <button
                type="button"
                onClick={sessionInfo.onLock}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 font-bold text-[11px] border border-slate-200 transition-colors flex items-center gap-1"
              >
                <LogOut className="w-3 h-3" />
                <span>Lock</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Gate Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 light-card p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">
              Zero-Click Admission Terminal
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            Gate Camera Scanner
          </h1>
          <p className="text-xs text-slate-500">
            Hold attendee QR in camera frame. Admittance records automatically with no button clicks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
            title={soundEnabled ? "Mute chime" : "Enable chime"}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {lockedMode ? (
            <div
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-900 text-xs font-bold"
              title="Gate terminal is locked to this event"
            >
              <Lock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate max-w-[180px] sm:max-w-[240px]">
                {activeEvent.title}
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-blue-200/70 text-[9px] uppercase tracking-wider text-blue-800 shrink-0">
                Locked
              </span>
            </div>
          ) : (
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="bg-white border border-slate-200 text-slate-900 text-xs font-semibold rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Scanner Viewport Area */}
      <div className="relative light-card rounded-3xl overflow-hidden shadow-xl bg-slate-950 border border-slate-200">
        <div
          id={readerElementId}
          className="w-full min-h-[360px] sm:min-h-[460px] max-w-full overflow-hidden"
        />

        {/* Radar Scanning Line Animation overlay */}
        {isScanning && !lastScanResult && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            <div className="w-64 h-64 border-2 border-blue-400/50 rounded-2xl relative">
              <span className="scanner-corner-tl" />
              <span className="scanner-corner-tr" />
              <span className="scanner-corner-bl" />
              <span className="scanner-corner-br" />

              <div className="w-full h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_12px_#3b82f6] animate-radar-sweep" />
            </div>
            <p className="mt-4 text-xs font-semibold text-white tracking-wider uppercase bg-black/60 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/20">
              Align QR Code Inside Box
            </p>
          </div>
        )}

        {/* Scan Status Feedback Overlay */}
        {lastScanResult && (
          <div
            className={`absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-150 backdrop-blur-md ${
              lastScanResult.code === "ADMITTED"
                ? "bg-emerald-950/90 text-white"
                : lastScanResult.code === "ALREADY_CHECKED_IN"
                ? "bg-amber-950/90 text-white"
                : "bg-rose-950/90 text-white"
            }`}
          >
            {lastScanResult.code === "ADMITTED" ? (
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
              </div>
            ) : lastScanResult.code === "ALREADY_CHECKED_IN" ? (
              <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center mb-3">
                <AlertTriangle className="w-12 h-12 text-amber-400 animate-pulse" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center mb-3">
                <XCircle className="w-12 h-12 text-rose-400" />
              </div>
            )}

            <div className="text-3xl font-black uppercase tracking-wider mb-1">
              {lastScanResult.code === "ADMITTED"
                ? "Admitted"
                : lastScanResult.code === "ALREADY_CHECKED_IN"
                ? "Already Admitted"
                : "Admission Rejected"}
            </div>

            <div className="text-sm font-semibold opacity-90 max-w-sm mb-4">
              {lastScanResult.message}
            </div>

            {lastScanResult.attendee && (
              <div className="bg-white/10 rounded-2xl p-4 max-w-sm w-full border border-white/15 space-y-1 mb-4">
                <div className="text-xl font-bold">{lastScanResult.attendee.fullName}</div>
                <div className="text-xs opacity-75 font-mono">
                  {lastScanResult.attendee.id} &bull; {lastScanResult.attendee.ticketType}
                </div>
                {lastScanResult.attendee.organization && (
                  <div className="text-xs opacity-90 font-medium">
                    {lastScanResult.attendee.organization}
                  </div>
                )}
              </div>
            )}

            {cooldownCountdown !== null && (
              <div className="text-xs font-mono tracking-widest uppercase bg-white/20 px-3 py-1 rounded-full">
                Auto-resuming in {cooldownCountdown}s...
              </div>
            )}
          </div>
        )}

        {/* Camera Error banner */}
        {cameraError && (
          <div className="absolute inset-0 bg-slate-900/95 z-30 flex flex-col items-center justify-center p-6 text-center text-white">
            <Camera className="w-12 h-12 text-rose-400 mb-3" />
            <h3 className="text-lg font-bold">Camera Unavailable</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">{cameraError}</p>
            <button
              onClick={startScanner}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Camera Permission</span>
            </button>
          </div>
        )}
      </div>

      {/* Manual Input Fallback */}
      <div className="light-card p-5 rounded-2xl">
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-4 h-4 text-slate-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Manual Ticket ID Fallback
          </h2>
        </div>
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="e.g. TKT-LAG-1001"
            className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2 text-xs font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:normal-case placeholder:font-sans"
          />
          <button
            type="submit"
            disabled={isManualChecking || !manualCode.trim()}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-colors"
          >
            {isManualChecking ? "Admitting..." : "Admit Attendee"}
          </button>
        </form>
      </div>

      {/* Live Recent Admissions Strip */}
      {recentAdmissions.length > 0 && (
        <div className="light-card p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              <span>Recent Admissions Live Stream</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Last 10 Scanned</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentAdmissions.map((att) => (
              <div
                key={att.id}
                className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900 truncate max-w-[150px]">
                    {att.fullName}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">{att.id}</div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                    {att.ticketType}
                  </span>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(att.checkedInAt || "").toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
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
