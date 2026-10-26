import { NextRequest, NextResponse } from "next/server";
import { fetchEventById } from "@/lib/repository";
import { verifyPinForEvent, createAuthToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pin, targetRole, eventId } = body;

    if (!pin || !targetRole) {
      return NextResponse.json(
        { error: "PIN and target role are required." },
        { status: 400 }
      );
    }

    let event = null;
    if (eventId) {
      event = await fetchEventById(eventId);
    }

    const check = verifyPinForEvent({
      pin,
      targetRole,
      event,
    });

    if (!check.valid || !check.resolvedRole) {
      return NextResponse.json(
        { error: check.error || "Invalid PIN." },
        { status: 401 }
      );
    }

    const token = createAuthToken({
      role: check.resolvedRole,
      eventId: event?.id,
      eventSlug: event?.slug,
      eventName: event?.title,
    });

    const now = Date.now();
    return NextResponse.json({
      success: true,
      role: check.resolvedRole,
      token,
      expiresAt: now + 60 * 60 * 1000,
      lastVerifiedAt: now,
      eventName: event?.title,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Authentication failed." },
      { status: 500 }
    );
  }
}
