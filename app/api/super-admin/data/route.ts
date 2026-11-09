import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";
import {
  getAllCampaigns,
  getAllGlobalParticipants,
} from "@/lib/campaign";

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

    const { searchParams } = new URL(request.url);
    const isExport = searchParams.get("export") === "true";

    // On-demand full export when Super Admin clicks 'Export All'
    if (isExport) {
      const participants = await getAllGlobalParticipants();
      return NextResponse.json({
        success: true,
        participants,
      });
    }

    // Fast Campaign Directory endpoint: only fetches the campaign documents (O(1), <200ms).
    // Analytics totals & recent winners are fetched independently via /api/super-admin/analytics.
    const campaigns = await getAllCampaigns();

    return NextResponse.json({
      success: true,
      campaigns,
    });
  } catch (err: any) {
    console.error("API /api/super-admin/data error:", err);
    return NextResponse.json(
      { error: "Failed to fetch super admin data." },
      { status: 500 }
    );
  }
}
