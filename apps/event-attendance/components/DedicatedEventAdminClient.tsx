"use client";

import { EventItem } from "@/lib/types";
import { SecurityAuthGuard } from "./SecurityAuthGuard";
import { AdminDashboardView } from "./AdminDashboardView";

interface Props {
  event: EventItem;
  slug: string;
}

export function DedicatedEventAdminClient({ event, slug }: Props) {
  return (
    <SecurityAuthGuard
      targetRole="admin"
      eventId={event.id}
      eventSlug={event.slug}
      eventTitle={event.title}
      defaultEmail={event.adminEmail}
      title="Event Operations Admin"
      description={`Sign in with your Admin Email (${event.adminEmail || "admin@nestle.com"}) and password to access attendee roster and gate analytics for ${event.title}.`}
    >
      {(auth) => (
        <AdminDashboardView
          initialEvent={event}
          lockedMode={true}
          targetSlug={slug}
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

