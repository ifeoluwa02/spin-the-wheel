import { NextRequest, NextResponse } from "next/server";
import { refreshSignedSession } from "@/lib/auth-session";

export async function POST(request: NextRequest) {
  try {
    const campaignCookie = request.cookies.get("campaign_session")?.value;
    const superAdminCookie = request.cookies.get("super_admin_session")?.value;
    const baCookie = request.cookies.get("ba_session")?.value;

    const cookieHeader = request.headers.get("authorization");
    const bearerToken = cookieHeader?.startsWith("Bearer ") ? cookieHeader.slice(7) : null;

    // 1. Check campaign session (Admin or Supervisor)
    const targetToken = campaignCookie || superAdminCookie || baCookie || bearerToken;
    if (!targetToken) {
      return NextResponse.json(
        { error: "No active session found. Please log in.", expired: true },
        { status: 401 }
      );
    }

    const refreshed = refreshSignedSession(targetToken, 1);
    if (!refreshed) {
      // Token is invalid or expired (> 1 hour)
      const res = NextResponse.json(
        { error: "Your session has expired after 1 hour. Please log in again.", expired: true },
        { status: 401 }
      );
      // Clear all expired session cookies
      res.cookies.set("campaign_session", "", { path: "/", maxAge: 0 });
      res.cookies.set("super_admin_session", "", { path: "/", maxAge: 0 });
      res.cookies.set("ba_session", "", { path: "/", maxAge: 0 });
      return res;
    }

    const { token, payload } = refreshed;
    const response = NextResponse.json({
      success: true,
      user: payload,
      expiresAt: payload.exp,
    });

    // Set updated cookie with fresh 1-hour maxAge
    const cookieName =
      payload.role === "super-admin"
        ? "super_admin_session"
        : payload.role === "ba"
        ? "ba_session"
        : "campaign_session";

    response.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60, // 1 hour (3600 seconds)
    });

    return response;
  } catch (err: any) {
    console.error("API /api/auth/refresh error:", err);
    return NextResponse.json(
      { error: "Failed to refresh session.", expired: true },
      { status: 500 }
    );
  }
}
