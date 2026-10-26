import { NextRequest, NextResponse } from "next/server";
import { fetchEventById } from "@/lib/repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const event = await fetchEventById(params.slug);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, event });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load event" },
      { status: 500 }
    );
  }
}
