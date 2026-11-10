import { NextRequest, NextResponse } from "next/server";
import { fetchAttendeeByTicketId, fetchEventById } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { ticketId: string } }
) {
  try {
    const attendee = await fetchAttendeeByTicketId(
      decodeURIComponent(params.ticketId)
    );
    if (!attendee) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const rawEvent = await fetchEventById(attendee.eventId);
    let safeEvent = null;
    if (rawEvent) {
      const { adminPassword, ...rest } = rawEvent;
      safeEvent = rest;
    }

    return NextResponse.json({
      success: true,
      attendee,
      event: safeEvent,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load ticket" },
      { status: 500 }
    );
  }
}
