import { NextRequest, NextResponse } from "next/server";
import { registerNewAttendee, fetchEventById } from "@/lib/repository";
import { generateTicketEmailHtml } from "@/lib/email-template";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, fullName, email, phone, organization, jobTitle, ticketType, customData } = body;

    if (!eventId || !fullName || !email) {
      return NextResponse.json(
        { error: "Event ID, full name, and email are required." },
        { status: 400 }
      );
    }

    const event = await fetchEventById(eventId);
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const attendee = await registerNewAttendee({
      eventId,
      fullName,
      email,
      phone: phone || "",
      organization: organization || "",
      jobTitle: jobTitle || "",
      ticketType: ticketType || "General Admission",
      customData: customData || {},
    });

    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3002";
    const appBaseUrl = `${protocol}://${host}`;

    // Generate ticket email HTML template
    const emailHtml = generateTicketEmailHtml({
      event,
      attendee,
      appBaseUrl,
    });

    // In production, send via Resend if API key is provided
    let emailSent = false;
    let emailProvider = "mock/instant-preview";

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || "Events <tickets@resend.dev>",
            to: [attendee.email],
            subject: `🎟️ Your Entry Ticket: ${event.title}`,
            html: emailHtml,
          }),
        });
        if (resendRes.ok) {
          emailSent = true;
          emailProvider = "resend";
        }
      } catch (e) {
        console.error("Resend API failed:", e);
      }
    }

    return NextResponse.json({
      success: true,
      attendee,
      emailSent,
      emailProvider,
      emailPreviewHtml: emailHtml,
      ticketUrl: `${appBaseUrl}/ticket/${encodeURIComponent(attendee.id)}`,
    });
  } catch (err: unknown) {
    console.error("Registration failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
