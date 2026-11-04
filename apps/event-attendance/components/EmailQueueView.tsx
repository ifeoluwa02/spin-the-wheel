"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  Info,
  Calendar,
  Layers,
} from "lucide-react";
import { EmailQuotaStats, QueuedEmail } from "@/lib/email-service";

export function EmailQueueView() {
  const [stats, setStats] = useState<EmailQuotaStats | null>(null);
  const [queue, setQueue] = useState<QueuedEmail[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [fromEmail, setFromEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<string | null>(null);

  // Test email state
  const [testEmailInput, setTestEmailInput] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    tip?: string;
  } | null>(null);

  const fetchEmailData = useCallback(async () => {
    try {
      const res = await fetch("/api/email/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setQueue(data.queue || []);
        setIsConfigured(Boolean(data.configured));
        setFromEmail(data.fromEmail || "Events <onboarding@resend.dev>");
      }
    } catch (e) {
      console.warn("Failed to fetch email stats:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmailData();
    const interval = setInterval(fetchEmailData, 15000); // 15s auto-refresh
    return () => clearInterval(interval);
  }, [fetchEmailData]);

  const handleProcessQueue = async () => {
    setIsProcessing(true);
    setProcessResult(null);
    try {
      const res = await fetch("/api/email/process-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxBatch: 25 }),
      });
      const data = await res.json();
      if (res.ok) {
        setProcessResult(
          `Processed ${data.processed} email(s): ${data.succeeded} succeeded, ${data.failed} failed.`
        );
        await fetchEmailData();
      } else {
        setProcessResult(data.error || "Failed to process queue");
      }
    } catch (err: unknown) {
      setProcessResult(err instanceof Error ? err.message : "Error processing queue");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetrySingle = async (queueId: string) => {
    try {
      const res = await fetch("/api/email/process-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });
      if (res.ok) {
        await fetchEmailData();
      }
    } catch (e) {
      console.warn("Retry failed:", e);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailInput.trim()) return;

    setIsSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: testEmailInput.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `Test email successfully sent to ${data.recipient}! Check your inbox.`,
        });
        await fetchEmailData();
      } else {
        setTestResult({
          success: false,
          message: data.error || "Failed to send test email.",
          tip: data.tip,
        });
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to send test email.",
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  if (isLoading && !stats) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-slate-500">Loading Resend quota and delivery queue...</p>
      </div>
    );
  }

  const limit = stats?.limit || 100;
  const sentToday = stats?.sentToday || 0;
  const remainingToday = stats?.remainingToday ?? 100;
  const percentUsed = Math.min(100, Math.round((sentToday / limit) * 100));

  return (
    <div className="space-y-6">
      {/* Top Banner: Resend Configuration & Status */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Resend Email Delivery &amp; Quota</h2>
                {isConfigured ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    API Key Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    Mock / Missing Key
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Automated daily quota tracking (100 emails/day), rate limiting (2 req/sec), and queue rollover.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchEmailData}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors text-xs font-semibold flex items-center gap-1.5"
              title="Refresh Quota"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleProcessQueue}
              disabled={isProcessing || (stats?.queuedToday === 0)}
              className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {isProcessing ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Process Queue Now</span>
            </button>
          </div>
        </div>

        {/* Quota Progress Bar & Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          {/* Gauge */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Today&apos;s Send Quota (UTC)</span>
              <span className="font-mono font-bold text-slate-900">{sentToday} / {limit}</span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  percentUsed >= 95
                    ? "bg-rose-500"
                    : percentUsed >= 75
                    ? "bg-amber-500"
                    : "bg-blue-600"
                }`}
                style={{ width: `${percentUsed}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span>{remainingToday} slots remaining today</span>
              <span className="font-mono">{percentUsed}% utilized</span>
            </div>
          </div>

          {/* Reset Countdown */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Next Quota Reset
              </div>
              <div className="text-sm font-black text-slate-900 font-mono">
                in {stats?.resetsInHours}h {stats?.resetsInMinutes}m
              </div>
              <div className="text-[10px] text-slate-400">
                Resets at 00:00:00 UTC daily
              </div>
            </div>
          </div>

          {/* Queue Count */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Pending In Queue
              </div>
              <div className="text-sm font-black text-slate-900 font-mono">
                {stats?.queuedToday ?? 0} Email(s)
              </div>
              <div className="text-[10px] text-slate-400">
                Scheduled for next available quota
              </div>
            </div>
          </div>
        </div>

        {processResult && (
          <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0 text-blue-600" />
            <span>{processResult}</span>
          </div>
        )}
      </div>

      {/* Two Column: Live Test Email Sender & Sandbox Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Email Box */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Send Live Test Ticket Email</h3>
          </div>
          <p className="text-xs text-slate-500">
            Verify that your Resend API key and sender address are transmitting properly to your inbox.
          </p>

          <form onSubmit={handleSendTestEmail} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                required
                placeholder="your.email@example.com"
                value={testEmailInput}
                onChange={(e) => setTestEmailInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono text-[11px]">From: {fromEmail}</span>
              <button
                type="submit"
                disabled={isSendingTest || !testEmailInput.trim()}
                className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSendingTest ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Send Test</span>
              </button>
            </div>
          </form>

          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                testResult.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              <div className="font-semibold">{testResult.message}</div>
              {testResult.tip && (
                <div className="mt-1 text-[11px] opacity-90 leading-relaxed">
                  💡 {testResult.tip}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Free Tier Guide / Knowledge Box */}
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-3 text-xs text-slate-600">
          <div className="flex items-center gap-2 text-slate-900 font-bold">
            <Info className="w-4 h-4 text-blue-600" />
            <span>Resend Free Tier Guidelines</span>
          </div>

          <ul className="space-y-2 list-disc list-inside text-[12px] leading-relaxed">
            <li>
              <strong>100 Emails/Day Limit:</strong> Resend limits free accounts to 100 emails every UTC day. When attendee registrations hit 100, Passflow automatically queues additional tickets for tomorrow instead of failing registrations.
            </li>
            <li>
              <strong>Rate Limit:</strong> 2 requests per second. The Passflow queue automatically throttles dispatch at 600ms intervals so your API key never encounters 429 errors.
            </li>
            <li>
              <strong>Default Sandbox Sender:</strong> If you use <code className="bg-slate-200/80 px-1 py-0.5 rounded font-mono text-[11px]">onboarding@resend.dev</code>, Resend only allows sending to the email registered on your Resend account.
            </li>
            <li>
              <strong>Custom Domain for All Attendees:</strong> Once you add and verify your custom domain in Resend (e.g. <code className="bg-slate-200/80 px-1 py-0.5 rounded font-mono text-[11px]">tickets@yourdomain.com</code>), set <code className="bg-slate-200/80 px-1 py-0.5 rounded font-mono text-[11px]">EMAIL_FROM</code> in your environment to send to any attendee.
            </li>
          </ul>
        </div>
      </div>

      {/* Queue Roster Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Email Queue &amp; Transmission Log</h3>
            <p className="text-xs text-slate-500">
              List of ticket delivery attempts, queue statuses, and next scheduled delivery windows.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-500">
            {queue.length} Total Recorded
          </span>
        </div>

        {queue.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            No emails currently in queue. All registered attendees have either received their pass or no limit has been reached yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100 text-[10px]">
                <tr>
                  <th className="py-3 px-4">Attendee</th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reason / Info</th>
                  <th className="py-3 px-4">Scheduled / Sent At</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {queue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {item.attendeeName}
                      <div className="text-[10px] text-slate-400 font-mono">{item.attendeeId}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">{item.to}</td>
                    <td className="py-3 px-4 max-w-[160px] truncate" title={item.eventTitle}>
                      {item.eventTitle}
                    </td>
                    <td className="py-3 px-4">
                      {item.status === "sent" ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Sent
                        </span>
                      ) : item.status === "queued" ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Queued
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-slate-500">
                      {item.queueReason === "DAILY_LIMIT_REACHED"
                        ? "Daily quota (100) reached"
                        : item.queueReason === "RATE_LIMIT_429"
                        ? "Resend 429 rate limit"
                        : item.lastError || "Standard dispatch"}
                    </td>
                    <td className="py-3 px-4 text-[11px] font-mono text-slate-500">
                      {item.sentAt
                        ? new Date(item.sentAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : item.scheduledFor
                        ? `Sched: ${new Date(item.scheduledFor).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : "Pending"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {item.status !== "sent" && (
                        <button
                          type="button"
                          onClick={() => handleRetrySingle(item.id)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-colors"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

