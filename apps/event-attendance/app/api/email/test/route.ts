import { NextRequest, NextResponse } from "next/server";
import { getEmailQuotaStats } from "@/lib/email-service";
import { verifyApiAuthorization } from "@/lib/auth";
import { containsMaliciousPayload, escapeHtml, sanitizeText } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const auth = verifyApiAuthorization(req, ["super-admin", "admin"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || "Admin authentication required" },
        { status: auth.status || 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { toEmail } = body;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "RESEND_API_KEY is not set. Add RESEND_API_KEY to your .env.local file.",
        },
        { status: 400 }
      );
    }

    if (!toEmail || containsMaliciousPayload(toEmail)) {
      return NextResponse.json(
        { success: false, error: "A valid recipient email address is required." },
        { status: 400 }
      );
    }

    const recipient = sanitizeText(toEmail, 160).toLowerCase();
    if (!recipient || !recipient.includes("@")) {
      return NextResponse.json(
        { success: false, error: "A valid recipient email address is required." },
        { status: 400 }
      );
    }

    const fromEmail = process.env.EMAIL_FROM || "Events <onboarding@resend.dev>";

    const testHtml = `
      <div style="font-family: sans-serif; background: #0b0f19; color: #ffffff; padding: 32px; border-radius: 16px; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #38bdf8; margin-top: 0;">🎉 Resend Integration Test</h2>
        <p style="color: #cbd5e1; font-size: 14px;">Your Resend API key is properly configured and verified for Passflow Event Attendance.</p>
        <div style="background: #1e293b; padding: 16px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 13px;">
          <div>Sender: ${escapeHtml(fromEmail)}</div>
          <div>Recipient: ${escapeHtml(recipient)}</div>
          <div>Timestamp: ${new Date().toISOString()}</div>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">Daily limit checks, queuing, and dynamic QR ticketing are active.</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject: "✅ Passflow Resend Integration Test",
        html: testHtml,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const stats = await getEmailQuotaStats();
      return NextResponse.json({
        success: true,
        messageId: data.id,
        fromEmail,
        recipient,
        stats,
      });
    }

    const errorMsg = data.message || `Resend error: ${res.status}`;
    let tip = "";
    if (res.status === 403 || errorMsg.includes("testing domain")) {
      tip =
        "When using the default 'onboarding@resend.dev' sandbox domain, Resend only allows sending to the email address registered with your Resend account. To send to any attendee email, verify a custom domain in the Resend dashboard.";
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
        tip,
        status: res.status,
      },
      { status: res.status >= 400 && res.status < 500 ? res.status : 500 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send test email" },
      { status: 500 }
    );
  }
}
