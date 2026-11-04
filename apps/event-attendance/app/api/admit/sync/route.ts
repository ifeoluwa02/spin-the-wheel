import { NextRequest, NextResponse } from "next/server";
import { admitAttendeeByQr, fetchAttendeesByEvent } from "@/lib/repository";
import { validateQrOrTicketInput, sanitizeText } from "@/lib/validation";
import { verifyApiAuthorization } from "@/lib/auth";

export interface OfflineSyncItem {
  qrData: string;
  ticketId?: string;
  eventId: string;
  scannedAt: string;
  terminalId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items: OfflineSyncItem[] = Array.isArray(body.items) ? body.items : [];
    const targetEventId: string | undefined = body.eventId || items[0]?.eventId;

    const auth = verifyApiAuthorization(
      req,
      ["super-admin", "admin", "usher"],
      targetEventId ? sanitizeText(targetEventId, 90) : undefined
    );
    if (!auth.authorized) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error || "Operator authentication required for offline sync",
        },
        { status: auth.status || 401 }
      );
    }

    const results = [];
    let syncedCount = 0;

    for (const item of items) {
      const check = validateQrOrTicketInput(item.qrData, item.eventId || targetEventId);
      if (!check.valid || !check.data) continue;

      const res = await admitAttendeeByQr(
        check.data.qrData,
        check.data.eventId,
        sanitizeText(item.terminalId || "Offline-Gate-Sync", 60)
      );
      if (res.success || res.code === "ALREADY_CHECKED_IN") {
        syncedCount += 1;
      }
      results.push({
        qrData: check.data.qrData,
        scannedAt: item.scannedAt,
        result: res,
      });
    }

    const attendees = targetEventId
      ? await fetchAttendeesByEvent(sanitizeText(targetEventId, 90))
      : [];

    return NextResponse.json({
      success: true,
      syncedCount,
      results,
      attendees,
    });
  } catch (err: unknown) {
    console.error("Offline sync API error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to sync offline check-ins",
      },
      { status: 500 }
    );
  }
}
