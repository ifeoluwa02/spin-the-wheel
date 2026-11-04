import { NextRequest, NextResponse } from "next/server";
import { admitAttendeeByQr } from "@/lib/repository";
import { validateQrOrTicketInput, sanitizeText } from "@/lib/validation";
import { verifyApiAuthorization } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { qrData, eventId, terminalId } = body;

    const validation = validateQrOrTicketInput(qrData, eventId);
    if (!validation.valid || !validation.data) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_TICKET",
          message: validation.error || "Invalid QR payload",
        },
        { status: 400 }
      );
    }

    // Require active operator session (Super-Admin, Event Admin, or Gate Usher)
    const auth = verifyApiAuthorization(
      req,
      ["super-admin", "admin", "usher"],
      validation.data.eventId
    );
    if (!auth.authorized) {
      return NextResponse.json(
        {
          success: false,
          code: "UNAUTHORIZED",
          message: auth.error || "Operator authentication required to admit tickets",
        },
        { status: auth.status || 401 }
      );
    }

    const safeTerminalId = sanitizeText(terminalId || "Gate-Camera-Terminal", 60);

    const result = await admitAttendeeByQr(
      validation.data.qrData,
      validation.data.eventId,
      safeTerminalId || "Gate-Camera-Terminal"
    );
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Admit API error:", err);
    return NextResponse.json(
      {
        success: false,
        code: "SERVER_ERROR",
        message:
          err instanceof Error
            ? err.message
            : "Internal server error during admission check",
      },
      { status: 500 }
    );
  }
}
