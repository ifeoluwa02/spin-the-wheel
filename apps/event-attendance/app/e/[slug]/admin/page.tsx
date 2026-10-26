import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { fetchEventById } from "@/lib/repository";
import { SecurityAuthGuard } from "@/components/SecurityAuthGuard";
import { AdminDashboardView } from "@/components/AdminDashboardView";

interface PageProps {
  params: {
    slug: string;
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const event = await fetchEventById(params.slug);
  if (!event) return { title: "Event Operations | Passflow" };
  return {
    title: `Admin: ${event.title} | Passflow`,
    description: `Operations and attendee registry portal for ${event.title}`,
  };
}

export default async function DedicatedEventAdminPage({ params }: PageProps) {
  const event = await fetchEventById(params.slug);

  if (!event) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-sm">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900">Event Not Found</h1>
          <p className="text-xs text-slate-500">
            Cannot open admin dashboard. No active event matches{" "}
            <span className="font-mono text-blue-600 font-bold">{params.slug}</span>.
          </p>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go to Super-Admin</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SecurityAuthGuard
      targetRole="admin"
      eventId={event.id}
      eventSlug={event.slug}
      eventTitle={event.title}
      title="Event Operations Admin"
      description={`Enter Event Admin PIN (Default: 1234) to access attendee roster and gate analytics for ${event.title}.`}
    >
      {(auth) => (
        <AdminDashboardView
          initialEvent={event}
          lockedMode={true}
          targetSlug={params.slug}
          sessionInfo={{
            role: auth.session.role,
            secondsRemaining: auth.secondsRemaining,
            onLock: auth.lockSession,
            onReverify: auth.reVerifyNow,
          }}
        />
      )}
    </SecurityAuthGuard>
  );
}
