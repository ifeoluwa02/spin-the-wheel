import { NextRequest, NextResponse } from "next/server";
import { fetchAllEvents, createNewEvent } from "@/lib/repository";

export async function GET() {
  try {
    const events = await fetchAllEvents();
    return NextResponse.json({ events });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load events" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, slug, organizer, description, venueName, venueAddress, city, state, startDate, endDate, capacity, bannerGradient } = body;

    if (!title || !venueName || !startDate) {
      return NextResponse.json(
        { error: "Title, venue name, and start date are required" },
        { status: 400 }
      );
    }

    const eventSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const newEvent = await createNewEvent({
      slug: eventSlug,
      title,
      category: body.category || "General Event",
      organizer: organizer || "Event Organizer",
      description: description || "",
      venueName,
      venueAddress: venueAddress || "",
      city: city || "Lagos",
      state: state || "Lagos",
      startDate,
      endDate: endDate || startDate,
      capacity: Number(capacity) || 500,
      bannerGradient: bannerGradient || "from-indigo-600 via-purple-600 to-pink-600",
    });

    return NextResponse.json({ success: true, event: newEvent });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create event" },
      { status: 500 }
    );
  }
}
