import { NextRequest, NextResponse } from "next/server";
import { processQueuedEmails, retryQueuedEmail } from "@/lib/email-service";
import { verifyApiAuthorization } from "@/lib/auth";
import { containsMaliciousPayload, sanitizeText } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const auth = verifyApiAuthorization(req, ["super-admin", "admin"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error || "Admin authentication required" },
        { status: auth.status || 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { queueId, maxBatch } = body;

    if (queueId) {
      if (containsMaliciousPayload(queueId)) {
        return NextResponse.json(
          { success: false, error: "Invalid queueId" },
          { status: 400 }
        );
      }
      const res = await retryQueuedEmail(sanitizeText(queueId, 90));
      return NextResponse.json({
        success: res.success,
        messageId: res.messageId,
        error: res.error,
      });
    }

    const batchSize = Math.min(50, Math.max(1, Number(maxBatch) || 25));
    const result = await processQueuedEmails(batchSize);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process email queue" },
      { status: 500 }
    );
  }
}
