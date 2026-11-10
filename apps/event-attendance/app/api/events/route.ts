import { NextRequest, NextResponse } from "next/server";
import { fetchAllEvents, createNewEvent } from "@/lib/repository";
import { validateCreateEventPayload } from "@/lib/validation";
import { verifyApiAuthorization } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await fetchAllEvents();
    // Sanitize sensitive password hashes before returning to client
    const safeEvents = events.map(({ adminPassword, ...rest }) => rest);
    return NextResponse.json({ events: safeEvents });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load events" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Require Super-Admin or Admin Session to Create Events
    const auth = verifyApiAuthorization(req, ["super-admin", "admin"]);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401 }
      );
    }

    const body = await req.json();

    // Strict Field Validation & PHP / Script / NoSQL Injection Guard
    const validation = validateCreateEventPayload(body);
    if (!validation.valid || !validation.data) {
      return NextResponse.json(
        {
          error: validation.error || "Invalid event fields.",
          fieldErrors: validation.fieldErrors,
        },
        { status: 400 }
      );
    }

    const validData = validation.data;

    // createNewEvent automatically hashes adminPassword with salted PBKDF2 (100k iterations)
    const newEvent = await createNewEvent({
      slug: validData.slug,
      title: validData.title,
      category: validData.category,
      organizer: validData.organizer,
      description: validData.description,
      venueName: validData.venueName,
      venueAddress: validData.venueAddress,
      city: validData.city,
      state: validData.state,
      startDate: validData.startDate,
      endDate: validData.endDate,
      capacity: validData.capacity,
      bannerGradient: validData.bannerGradient,
      adminEmail: validData.adminEmail,
      adminPassword: validData.adminPassword,
      usherPin: validData.usherPin,
    });

    const { adminPassword: _hidden, ...safeEvent } = newEvent;

    return NextResponse.json({ success: true, event: safeEvent });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create event" },
      { status: 500 }
    );
  }
}
