"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  User,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";

export default function SuperAdminOneTimeSetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [existingUsername, setExistingUsername] = useState<string | null>(null);

  const [username, setUsername] = useState("superadmin");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    async function checkStatus() {
      setChecking(true);
      try {
        const res = await fetch("/api/auth?checkSetup=1");
        if (res.ok) {
          const data = await res.json();
          setSetupCompleted(Boolean(data.setupCompleted));
          if (data.username) {
            setExistingUsername(data.username);
            setUsername(data.username);
          }
        }
      } catch (err) {
        console.error("Failed to check setup status:", err);
      } finally {
        setChecking(false);
      }
    }
    checkStatus();
  }, []);

  async function handleSetupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!username.trim() || username.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("field_ops_superadmin_token")
          : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/auth", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "setup_superadmin",
          username: username.trim().toLowerCase(),
          password,
          currentPassword: currentPassword || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Could not complete Superadmin setup.");
        return;
      }

      if (data.token) {
        localStorage.setItem("field_ops_superadmin_token", data.token);
      }

      setSetupCompleted(true);
      setSuccessMsg(
        "Superadmin password has been hashed (PBKDF2) and locked! Redirecting to Superadmin Console..."
      );
      setTimeout(() => {
        router.push("/superadmin");
      }, 1500);
    } catch {
      setError("Network error while saving Superadmin credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080E1A] text-slate-100 flex flex-col justify-between p-4 sm:p-6">
      {/* Top Bar */}
      <header className="max-w-xl w-full mx-auto flex items-center justify-between py-2">
        <Link
          href="/superadmin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Superadmin Sign In</span>
        </Link>
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
          One-Time Provisioning
        </span>
      </header>

      {/* Main Card */}
      <main className="max-w-md w-full mx-auto my-auto">
        <div className="bg-white/[0.03] border border-white/10 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-black shadow-lg shadow-teal-500/20 mx-auto">
              <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
            </div>
            <h1 className="text-xl font-black text-white tracking-tight">
              {setupCompleted
                ? "Superadmin Setup Locked"
                : "One-Time Superadmin Setup"}
            </h1>
            <p className="text-xs text-slate-400">
              {setupCompleted
                ? `Master credentials for "${existingUsername || "superadmin"}" are already initialized. To rotate the password, enter your current password below.`
                : "Set your master Superadmin username and password once. This page automatically locks after initial setup."}
            </p>
          </div>

          {checking ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-slate-400 font-mono">
              <RefreshCw className="w-5 h-5 text-teal-400 animate-spin" />
              <span>Checking provisioning state...</span>
            </div>
          ) : (
            <form onSubmit={handleSetupSubmit} className="space-y-4">
              {setupCompleted && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                  <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span>
                    One-time open provisioning is <strong>locked</strong>. Current password is required to update credentials.
                  </span>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Superadmin Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. superadmin"
                    className="w-full pl-10 pr-4 py-3 bg-black/40 border border-white/15 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-teal-400 transition"
                  />
                </div>
              </div>

              {setupCompleted && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1.5">
                    Current Password (Required to Unlock)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current master password"
                      className="w-full pl-10 pr-10 py-3 bg-black/40 border border-amber-500/30 rounded-xl text-white text-xs focus:outline-none focus:border-amber-400 transition"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  {setupCompleted ? "New Master Password" : "Create Master Password"}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
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

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-10 pr-10 py-3 bg-black/40 border border-white/15 rounded-xl text-white text-xs focus:outline-none focus:border-teal-400 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-black shadow-lg shadow-teal-500/20 transition cursor-pointer disabled:opacity-50"
              >
                {submitting
                  ? "Encrypting & Locking..."
                  : setupCompleted
                  ? "Update Master Password"
                  : "Complete One-Time Setup & Sign In"}
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="text-center py-3 text-[10px] text-white/30 font-mono">
        PBKDF2-SHA256 (100,000 Iterations) · Auto-Locking Provisioning Gate
      </footer>
    </div>
  );
}
