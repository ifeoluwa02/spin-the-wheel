import { NextRequest, NextResponse } from "next/server";
import { getSuperAdminConfig } from "@/lib/campaign";
import { createSignedSession } from "@/lib/auth-session";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const cfg = await getSuperAdminConfig();
    if (!cfg) {
      return NextResponse.json(
        { error: "Super Admin has not been initialized yet." },
        { status: 404 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password);

    if (cfg.email.toLowerCase() !== cleanEmail || cfg.password !== cleanPassword) {
      return NextResponse.json(
        { error: "Invalid master email or password." },
        { status: 401 }
      );
    }

    // Authentication verified
    const token = createSignedSession({
      role: "super-admin",
      email: cfg.email,
      name: "Super Admin",
    });

    const response = NextResponse.json({
      success: true,
      user: {
        role: "super-admin" as const,
        email: cfg.email,
        name: "Super Admin",
      },
    });

    response.cookies.set("super_admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (err: any) {
    console.error("API /api/auth/super-admin error:", err);
    return NextResponse.json(
      { error: "An error occurred during Super Admin login." },
      { status: 500 }
    );
  }
}
