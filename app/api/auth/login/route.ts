import { NextRequest, NextResponse } from "next/server";
import { getCampaign, authenticateCampaignAdmin, getSupervisorByCredentials } from "@/lib/campaign";
import { createSignedSession } from "@/lib/auth-session";

export async function POST(request: NextRequest) {
  try {
    const { campaignId, email, password } = await request.json();

    if (!campaignId || !email || !password) {
      return NextResponse.json(
        { error: "Campaign ID, email, and password are required." },
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

    // 1. Check if user is a Campaign Admin (primary or secondary)
    const adminUser = authenticateCampaignAdmin(campaign, cleanEmail, cleanPassword);
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
      });

      response.cookies.set("campaign_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
      });

      return response;
    }

    // 2. Check if user is a Supervisor
    const supervisorUser = await getSupervisorByCredentials(campaignId, cleanEmail, cleanPassword);
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
      });

      response.cookies.set("campaign_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
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
