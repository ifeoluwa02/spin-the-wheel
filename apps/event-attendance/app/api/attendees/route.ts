import { NextRequest, NextResponse } from "next/server";
import { fetchAttendeesByEvent } from "@/lib/repository";
import { containsMaliciousPayload, sanitizeText } from "@/lib/validation";
import { verifyApiAuthorization } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawEventId = searchParams.get("eventId");

    if (!rawEventId || containsMaliciousPayload(rawEventId)) {
      return NextResponse.json(
        { error: "Valid eventId query parameter is required" },
        { status: 400 }
      );
    }

    const eventId = sanitizeText(rawEventId, 90);

    // Require active operator session (Super-Admin, Event Admin, or Gate Usher) to view attendee PII
    const auth = verifyApiAuthorization(
      req,
      ["super-admin", "admin", "usher"],
      eventId
    );
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized access to attendee roster" },
        { status: auth.status || 401 }
      );
    }

    const attendees = await fetchAttendeesByEvent(eventId);
    return NextResponse.json({ success: true, attendees });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load attendees" },
      { status: 500 }
    );
  }
}
