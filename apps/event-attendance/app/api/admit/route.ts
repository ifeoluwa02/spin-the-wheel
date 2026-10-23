import { NextRequest, NextResponse } from "next/server";
import { admitAttendeeByQr } from "@/lib/repository";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { qrData, eventId } = body;

    if (!qrData) {
      return NextResponse.json(
        { success: false, code: "INVALID_TICKET", message: "QR payload is missing" },
        { status: 400 }
      );
    }

    const result = await admitAttendeeByQr(qrData, eventId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Admit API error:", err);
    return NextResponse.json(
      {
        success: false,
        code: "SERVER_ERROR",
        message: err instanceof Error ? err.message : "Internal server error during admission check",
      },
      { status: 500 }
    );
  }
}
