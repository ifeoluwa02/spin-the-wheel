import { NextRequest, NextResponse } from "next/server";
import { getSuperAdminConfig, setSuperAdminConfig } from "@/lib/campaign";
import { verifySignedSession, hashPassword, verifyPassword } from "@/lib/auth-session";

export async function POST(request: NextRequest) {
  try {
    const { currentPassword, newPassword } = await request.json();

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const cfg = await getSuperAdminConfig();
    if (!cfg) {
      return NextResponse.json(
        { error: "Super Admin account not found." },
        { status: 404 }
      );
    }

    // Check if user is either authenticated via session or provides correct currentPassword
    const superAdminCookie = request.cookies.get("super_admin_session")?.value;
    const session = superAdminCookie ? verifySignedSession(superAdminCookie) : null;
    const isAuthedSession = session && session.role === "super-admin";

    if (!isAuthedSession) {
      if (!currentPassword || !verifyPassword(String(currentPassword), cfg.password)) {
        return NextResponse.json(
          { error: "Incorrect current password. Password reset denied." },
          { status: 401 }
        );
      }
    }

    // Hash the new password with salted PBKDF2 (100,000 iterations)
    const newPasswordHash = hashPassword(newPassword);

    // Save to primary secure auth_credentials document (and synced legacy doc)
    await setSuperAdminConfig({
      email: cfg.email,
      password: newPasswordHash,
    });

    const response = NextResponse.json({
      success: true,
      message: "Master Admin password successfully updated and hashed in secure storage.",
    });

    return response;
  } catch (err: any) {
    console.error("API /api/auth/super-admin/reset-password error:", err);
    return NextResponse.json(
      { error: "Failed to reset password." },
      { status: 500 }
    );
  }
}
