"use client";

import { SecurityAuthGuard } from "@/components/SecurityAuthGuard";
import { AdminDashboardView } from "@/components/AdminDashboardView";

export default function SuperAdminPage() {
  return (
    <SecurityAuthGuard
      targetRole="super-admin"
      title="Master Super-Admin Portal"
      description="Enter Super-Admin PIN (Default: 9999) for cross-event management and operations."
    >
      {(auth) => (
        <AdminDashboardView
          lockedMode={false}
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
