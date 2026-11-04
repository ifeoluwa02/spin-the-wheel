import { NextRequest, NextResponse } from "next/server";
import { getEmailQuotaStats, getQueuedEmailsList } from "@/lib/email-service";
import { verifyApiAuthorization } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const auth = verifyApiAuthorization(req, ["super-admin", "admin"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error || "Admin authentication required" },
        { status: auth.status || 401 }
      );
    }

    const stats = await getEmailQuotaStats();
    const queue = await getQueuedEmailsList();

    const apiKeyConfigured = Boolean(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || "Events <onboarding@resend.dev>";

    return NextResponse.json({
      success: true,
      configured: apiKeyConfigured,
      fromEmail,
      stats,
      queue,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load email stats" },
      { status: 500 }
    );
  }
}
