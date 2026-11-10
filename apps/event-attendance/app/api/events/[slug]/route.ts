import { NextRequest, NextResponse } from "next/server";
import { fetchEventById } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const event = await fetchEventById(params.slug);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const { adminPassword: _hidden, ...safeEvent } = event;
    return NextResponse.json({ success: true, event: safeEvent });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load event" },
      { status: 500 }
    );
  }
}
