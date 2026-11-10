"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Lock,
  ShieldCheck,
  KeyRound,
  AlertCircle,
  Clock,
  LogOut,
  Mail,
  User,
  CheckCircle2,
} from "lucide-react";
import { UserRole, AuthSession } from "@/lib/types";

interface SecurityAuthGuardProps {
  targetRole: "super-admin" | "admin" | "usher";
  eventId?: string;
  eventSlug?: string;
  eventTitle?: string;
  title?: string;
  description?: string;
  defaultEmail?: string;
  children: (auth: {
    session: AuthSession;
    lockSession: () => void;
    reVerifyNow: () => void;
    secondsRemaining: number;
  }) => React.ReactNode;
}

const PIN_TIMEOUT_SECONDS = 30 * 60; // 30-minute verification cycle

export function SecurityAuthGuard({
  targetRole,
  eventId,
  eventSlug,
  eventTitle,
  title,
  description,
  defaultEmail,
  children,
}: SecurityAuthGuardProps) {
  const storageKey = `passflow_session_${targetRole}_${eventId || "global"}`;

  const [session, setSession] = useState<AuthSession | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Email & Password inputs for Admin / Super-Admin
  const [emailInput, setEmailInput] = useState(defaultEmail || "");
  const [passwordInput, setPasswordInput] = useState("");

  // PIN input for Usher
  const [pinInput, setPinInput] = useState("");

  // Re-verify input (password or PIN during 1-min challenge)
  const [reverifyInput, setReverifyInput] = useState("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 1-minute timer state
  const [secondsRemaining, setSecondsRemaining] = useState<number>(PIN_TIMEOUT_SECONDS);
  const [showReverifyModal, setShowReverifyModal] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Set default email when defaultEmail changes
  useEffect(() => {
    if (defaultEmail && !emailInput) {
      setEmailInput(defaultEmail);
    }
  }, [defaultEmail, emailInput]);

  // Restore existing session from sessionStorage and verify server httpOnly cookie
  useEffect(() => {
    async function restoreSession() {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const parsed: AuthSession = JSON.parse(raw);
          if (parsed.expiresAt && Date.now() < parsed.expiresAt) {
            // Confirm server cookie is also active
            const srvRes = await fetch("/api/auth/session", { cache: "no-store" }).catch(
              () => null
            );
            const srvData = srvRes && srvRes.ok ? await srvRes.json() : null;

            if (!srvData || srvData.authenticated) {
              setSession(parsed);
              const elapsed = Math.floor((Date.now() - parsed.lastVerifiedAt) / 1000);
              if (elapsed >= PIN_TIMEOUT_SECONDS) {
                setShowReverifyModal(true);
                setSecondsRemaining(0);
              } else {
                setSecondsRemaining(PIN_TIMEOUT_SECONDS - elapsed);
              }
            } else {
              sessionStorage.removeItem(storageKey);
            }
          } else {
            sessionStorage.removeItem(storageKey);
          }
        }
      } catch (e) {
        console.warn("Session restore error:", e);
      } finally {
        setIsInitializing(false);
      }
    }
    restoreSession();
  }, [storageKey]);

  // Countdown timer for 1-minute verification
  useEffect(() => {
    if (!session) return;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setShowReverifyModal(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session]);

  // Primary Login Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      let endpoint = "/api/auth/login";
      let body: Record<string, unknown> = {};

      if (targetRole === "super-admin") {
        endpoint = "/api/auth/super-admin";
        body = { email: emailInput.trim(), password: passwordInput };
      } else if (targetRole === "admin") {
        endpoint = "/api/auth/login";
        body = { eventId, email: emailInput.trim(), password: passwordInput };
      } else if (targetRole === "usher") {
        endpoint = "/api/auth/usher-login";
        body = { eventId, pin: pinInput.trim() };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Authentication failed");
      }

      const newSession: AuthSession = {
        role: data.user.role,
        email: data.user.email,
        name: data.user.name,
        token: data.token,
        eventId,
        eventSlug,
        eventName: data.user.eventName || eventTitle,
        expiresAt: data.expiresAt,
        lastVerifiedAt: Date.now(),
      };

      sessionStorage.setItem(storageKey, JSON.stringify(newSession));
      setSession(newSession);
      setPasswordInput("");
      setPinInput("");
      setSecondsRemaining(PIN_TIMEOUT_SECONDS);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setIsLoading(false);
    }
  };

  // 1-Minute Re-Verification Handler
  const handleReverify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverifyInput.trim()) {
      setErrorMsg("Please enter your credential to continue");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth/reverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: session?.role || targetRole,
          credential: reverifyInput.trim(),
          eventId,
          email: session?.email || emailInput,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Verification failed");
      }

      if (session) {
        const updated = {
          ...session,
          token: data.token || session.token,
          lastVerifiedAt: Date.now(),
        };
        sessionStorage.setItem(storageKey, JSON.stringify(updated));
        setSession(updated);
      }

      setShowReverifyModal(false);
      setReverifyInput("");
      setSecondsRemaining(PIN_TIMEOUT_SECONDS);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Re-verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLockSession = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    sessionStorage.removeItem(storageKey);
    setSession(null);
    setShowReverifyModal(false);
    setPasswordInput("");
    setPinInput("");
    setReverifyInput("");
    setSecondsRemaining(PIN_TIMEOUT_SECONDS);
  }, [storageKey]);

  const handleReVerifyNow = useCallback(() => {
    setShowReverifyModal(true);
  }, []);

  const defaultHint =
    targetRole === "super-admin"
      ? "Default Super-Admin: superadmin@passflow.io / admin123"
      : targetRole === "admin"
      ? `Default Event Admin: ${defaultEmail || "admin@nestle.com"} / admin123`
      : "Default Gate Usher PIN: 0000";

  if (isInitializing) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Checking authorization session...</p>
        </div>
      </div>
    );
  }

  // If no active session, show Email/Password login (or PIN for Usher)
  if (!session) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/90 p-8 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] uppercase tracking-wider">
              {targetRole === "super-admin"
                ? "Platform Super-Admin"
                : targetRole === "admin"
                ? "Event Operations Portal"
                : "Gate Scanner Access"}
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {title || (targetRole === "usher" ? "Usher Terminal Unlock" : "Administrator Sign In")}
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              {description ||
                (targetRole === "usher"
                  ? `Enter the Gate Usher PIN for ${eventTitle || "event"} to activate camera check-in.`
                  : `Sign in with your email and password to access ${eventTitle || "event operations"}.`)}
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 text-left animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {targetRole === "usher" ? (
            /* Usher PIN Pad */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input
                  type="password"
                  maxLength={6}
                  autoFocus
                  placeholder="••••"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full text-center text-3xl font-mono tracking-[0.5em] py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all shadow-inner"
                />
              </div>

              {/* Quick Numpad for mobile ushers */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPinInput((prev) => (prev.length < 6 ? prev + num : prev))}
                    className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-base transition-colors active:scale-95"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPinInput("")}
                  className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-semibold transition-colors"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setPinInput((prev) => (prev.length < 6 ? prev + "0" : prev))}
                  className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-base transition-colors active:scale-95"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                  className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-semibold transition-colors"
                >
                  &larr;
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading || !pinInput}
                className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Usher PIN...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Unlock Gate Scanner</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Admin & Super-Admin Email + Password Login Form */
            <form onSubmit={handleLogin} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Admin Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    autoFocus
                    placeholder={targetRole === "super-admin" ? "superadmin@passflow.io" : "admin@nestle.com"}
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !emailInput || !passwordInput}
                className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign In to Dashboard</span>
                  </>
                )}
              </button>
            </form>
          )}

          <p className="text-[11px] text-slate-400 font-mono text-center">
            {defaultHint}
          </p>
        </div>
      </div>
    );
  }

  // Session is active: Render the children with the 1-minute monitor + Re-verify challenge modal
  return (
    <>
      {/* 30-Minute Periodic Re-verify Challenge Modal */}
      {showReverifyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-white rounded-3xl border border-slate-200 p-6 shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Clock className="w-7 h-7 animate-pulse" />
            </div>

            <div className="space-y-1">
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] uppercase tracking-wider">
                30-Minute Security Challenge
              </span>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Session Active Verification
              </h2>
              <p className="text-xs text-slate-500">
                Please confirm your credential to verify an authorized operator is currently at this terminal.
              </p>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleReverify} className="space-y-3">
              <input
                type="password"
                autoFocus
                placeholder={targetRole === "usher" ? "Usher PIN (0000)" : "Password (admin123)"}
                value={reverifyInput}
                onChange={(e) => setReverifyInput(e.target.value)}
                className="w-full text-center text-lg font-mono py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all shadow-inner"
              />

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleLockSession}
                  className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Lock Terminal</span>
                </button>

                <button
                  type="submit"
                  disabled={isLoading || !reverifyInput}
                  className="py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Verify Active</span>
                </button>
              </div>
            </form>

            <p className="text-[10px] text-slate-400 font-mono">
              {defaultHint}
            </p>
          </div>
        </div>
      )}

      {/* Render Protected Content */}
      {children({
        session,
        lockSession: handleLockSession,
        reVerifyNow: handleReVerifyNow,
        secondsRemaining,
      })}
    </>
  );
}
