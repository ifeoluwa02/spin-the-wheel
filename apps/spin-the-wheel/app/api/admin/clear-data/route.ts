import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession, verifyPassword } from "@/lib/auth-session";
import { getCampaign, getSuperAdminConfig, clearCampaignData } from "@/lib/campaign";

export async function POST(request: NextRequest) {
  try {
    const campaignCookie = request.cookies.get("campaign_session")?.value;
    const superAdminCookie = request.cookies.get("super_admin_session")?.value;

    const campaignSession = campaignCookie ? verifySignedSession(campaignCookie) : null;
    const superAdminSession = superAdminCookie ? verifySignedSession(superAdminCookie) : null;

    const session = superAdminSession || campaignSession;
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please log in.", expired: true }, { status: 401 });
    }

    const { campaignId, password } = await request.json();
    if (!campaignId || !password) {
      return NextResponse.json({ error: "Campaign ID and password are required." }, { status: 400 });
    }

    if (campaignId === "all") {
      if (session.role !== "super-admin") {
        return NextResponse.json({ error: "Forbidden. Global wipe requires Super Admin privileges." }, { status: 403 });
      }
      const superCfg = await getSuperAdminConfig();
      if (!superCfg || !verifyPassword(String(password), superCfg.password)) {
        return NextResponse.json({ error: "Incorrect Super Admin password. Global wipe denied." }, { status: 401 });
      }
      const res = await clearCampaignData();
      return NextResponse.json({ success: true, deletedCount: res.deletedCount });
    }

    if (session.role === "admin" && session.campaignId !== campaignId) {
      return NextResponse.json({ error: "Forbidden. Access denied." }, { status: 403 });
    }

    // Verify master super admin password or campaign admin password
    const superCfg = await getSuperAdminConfig();
    const isSuperAdmin = superCfg && verifyPassword(String(password), superCfg.password);

    const campaign = await getCampaign(campaignId, true);
    const isCampaignAdmin =
      campaign &&
      ((campaign.adminPassword && verifyPassword(String(password), campaign.adminPassword)) ||
        campaign.admins?.some((a) => a.password && verifyPassword(String(password), a.password)));

    if (!isSuperAdmin && !isCampaignAdmin) {
      return NextResponse.json({ error: "Incorrect password. Reset denied." }, { status: 401 });
    }

    const res = await clearCampaignData(campaignId);


    return NextResponse.json({
      success: true,
      deletedCount: res.deletedCount,
    });
  } catch (err: any) {
    console.error("API /api/admin/clear-data error:", err);
    return NextResponse.json({ error: "Failed to clear campaign data." }, { status: 500 });
  }
}
