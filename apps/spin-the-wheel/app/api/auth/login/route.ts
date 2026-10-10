import { NextRequest, NextResponse } from "next/server";
import { getCampaign } from "@/lib/campaign";
import { createSignedSession, verifyPassword } from "@/lib/auth-session";
import type { CampaignAdmin, Supervisor } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const { campaignId, email, password } = await request.json();

    if (
      !campaignId ||
      !email ||
      !password ||
      typeof campaignId !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return NextResponse.json(
        { error: "Campaign ID, email, and password are required strings." },
        { status: 400 }
      );
    }

    const campaign = await getCampaign(campaignId, true);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found." },
        { status: 404 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password);

    // 1. Check if user is a Campaign Admin (primary or secondary) with dual-format verification
    let adminUser: CampaignAdmin | null = null;
    if (
      campaign.adminEmail &&
      campaign.adminEmail.toLowerCase() === cleanEmail &&
      verifyPassword(cleanPassword, campaign.adminPassword || "")
    ) {
      adminUser = {
        id: "primary-admin",
        name: "Primary Admin",
        email: campaign.adminEmail,
        password: campaign.adminPassword || "",
      };
    } else if (campaign.admins?.length) {
      const match = campaign.admins.find(
        (a) => a.email.toLowerCase() === cleanEmail && Boolean(a.password && verifyPassword(cleanPassword, a.password))
      );
      if (match) adminUser = match;
    }

    if (adminUser) {
      const token = createSignedSession({
        role: "admin",
        email: adminUser.email,
        name: adminUser.name,
        campaignId: campaign.id,
      });

      const response = NextResponse.json({
        success: true,
        user: {
          role: "admin" as const,
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
        },
        expiresAt: Date.now() + 60 * 60 * 1000,
      });

      response.cookies.set("campaign_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60, // 1 hour (3600 seconds)
      });

      return response;
    }

    // 2. Check if user is a Supervisor with dual-format verification
    let supervisorUser: Supervisor | null = null;
    if (campaign.supervisors?.length) {
      const match = campaign.supervisors.find(
        (sv) =>
          sv.email.toLowerCase() === cleanEmail &&
          Boolean(sv.password && verifyPassword(cleanPassword, sv.password))
      );
      if (match) supervisorUser = match;
    }
    if (supervisorUser) {
      const token = createSignedSession({
        role: "supervisor",
        email: supervisorUser.email,
        name: supervisorUser.name,
        campaignId: campaign.id,
        supervisorId: supervisorUser.id,
        scopeType: supervisorUser.scopeType,
        state: supervisorUser.state,
        storeIds: supervisorUser.storeIds,
      });

      const response = NextResponse.json({
        success: true,
        user: {
          role: "supervisor" as const,
          id: supervisorUser.id,
          name: supervisorUser.name,
          email: supervisorUser.email,
          scopeType: supervisorUser.scopeType,
          state: supervisorUser.state,
          storeIds: supervisorUser.storeIds,
        },
        expiresAt: Date.now() + 60 * 60 * 1000,
      });

      response.cookies.set("campaign_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60, // 1 hour (3600 seconds)
      });

      return response;
    }

    // 3. Invalid credentials
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  } catch (err: any) {
    console.error("API /api/auth/login error:", err);
    return NextResponse.json(
      { error: "An error occurred while authenticating. Please try again." },
      { status: 500 }
    );
  }
}
