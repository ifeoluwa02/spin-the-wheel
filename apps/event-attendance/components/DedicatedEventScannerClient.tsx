"use client";

import { EventItem } from "@/lib/types";
import { SecurityAuthGuard } from "./SecurityAuthGuard";
import { GateScannerView } from "./GateScannerView";

interface Props {
  event: EventItem;
  slug: string;
}

export function DedicatedEventScannerClient({ event, slug }: Props) {
  return (
    <SecurityAuthGuard
      targetRole="usher"
      eventId={event.id}
      eventSlug={event.slug}
      eventTitle={event.title}
      title="Gate Usher Terminal"
      description={`Enter Usher PIN (Default: 0000) to activate the scanner for ${event.title}.`}
    >
      {(auth) => (
        <GateScannerView
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

