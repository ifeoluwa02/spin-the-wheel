import { NextRequest, NextResponse } from "next/server";
import {
  createSignedSession,
  verifySuperAdminCredentials,
  SUPER_ADMIN_EMAIL,
  getRequestIp,
  checkAuthRateLimit,
  recordAuthFailure,
  clearAuthFailures,
} from "@/lib/auth";
import { containsMaliciousPayload } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const clientIp = getRequestIp(request);
    const rateLimit = checkAuthRateLimit(clientIp);
    if (rateLimit.blocked) {
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Please wait ${rateLimit.retryAfterSeconds}s before trying again.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    if (containsMaliciousPayload(email) || containsMaliciousPayload(password)) {
      recordAuthFailure(clientIp);
      return NextResponse.json(
        { error: "Rejected: Disallowed injection characters detected." },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password);

    const isValid = verifySuperAdminCredentials(cleanEmail, cleanPassword);

    if (!isValid) {
      recordAuthFailure(clientIp);
      return NextResponse.json(
        { error: "Invalid master email or password." },
        { status: 401 }
      );
    }

    clearAuthFailures(clientIp);

    const token = createSignedSession({
      role: "super-admin",
      email: SUPER_ADMIN_EMAIL,
      name: "Super Admin",
    });

    const expiresAt = Date.now() + 60 * 60 * 1000;

    const response = NextResponse.json({
      success: true,
      user: {
        role: "super-admin" as const,
        email: SUPER_ADMIN_EMAIL,
        name: "Super Admin",
      },
      token,
      expiresAt,
    });

    response.cookies.set("super_admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60,
    });

    return response;
  } catch (err: unknown) {
    console.error("API /api/auth/super-admin error:", err);
    return NextResponse.json(
      { error: "Super-Admin authentication failed." },
      { status: 500 }
    );
  }
}
