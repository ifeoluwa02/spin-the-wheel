import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";
import { getAllCampaigns, getAllGlobalParticipants } from "@/lib/campaign";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const superAdminCookie = request.cookies.get("super_admin_session")?.value;
    const session = superAdminCookie ? verifySignedSession(superAdminCookie) : null;

    if (!session || session.role !== "super-admin") {
      return NextResponse.json(
        { error: "Unauthorized. Super Admin access required." },
        { status: 401 }
      );
    }

    const [campaigns, participants] = await Promise.all([
      getAllCampaigns(),
      getAllGlobalParticipants(),
    ]);

    return NextResponse.json({
      success: true,
      campaigns,
      participants,
    });
  } catch (err: any) {
    console.error("API /api/super-admin/data error:", err);
    return NextResponse.json(
      { error: "Failed to fetch super admin data." },
      { status: 500 }
    );
  }
}
