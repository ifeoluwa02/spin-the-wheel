"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SecurityAuthGuard } from "@/components/SecurityAuthGuard";
import { GateScannerView } from "@/components/GateScannerView";

function ScannerProtectedContent() {
  const searchParams = useSearchParams();
  const eventParam = searchParams.get("event") || undefined;

  return (
    <SecurityAuthGuard
      targetRole="usher"
      eventSlug={eventParam}
      title="Gate Admission Terminal"
      description="Enter Usher PIN (Default: 0000) or Event Admin PIN to activate the gate scanner."
    >
      {(auth) => (
        <GateScannerView
          lockedMode={Boolean(eventParam)}
          targetSlug={eventParam}
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

export default function ZeroClickScannerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Initializing Gate Terminal...</p>
          </div>
        </div>
      }
    >
      <ScannerProtectedContent />
    </Suspense>
  );
}
