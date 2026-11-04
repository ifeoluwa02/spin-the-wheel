"use client";

import { SecurityAuthGuard } from "@/components/SecurityAuthGuard";
import { AdminDashboardView } from "@/components/AdminDashboardView";

export default function SuperAdminPage() {
  return (
    <SecurityAuthGuard
      targetRole="super-admin"
      defaultEmail="superadmin@passflow.io"
      title="Master Super-Admin Portal"
      description="Sign in with Master Super-Admin email and password (Default: superadmin@passflow.io / admin123) for cross-event oversight."
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
