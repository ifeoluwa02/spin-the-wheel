import { EventItem, AttendeeRegistration } from "./types";

/**
 * Generate a production-ready, responsive HTML email template for event admission
 */
export function generateTicketEmailHtml(params: {
  event: EventItem;
  attendee: AttendeeRegistration;
  appBaseUrl: string;
}): string {
  const { event, attendee, appBaseUrl } = params;

  // Generate QR code image URL via reliable public QR API so it renders directly in Gmail/Outlook
  const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    attendee.qrHash || attendee.id
  )}&margin=10`;

  const ticketPageUrl = `${appBaseUrl}/ticket/${encodeURIComponent(attendee.id)}`;

  const startDateFormatted = new Date(event.startDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const startTimeFormatted = new Date(event.startDate).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Google Calendar URL
  const gCalTitle = encodeURIComponent(event.title);
  const gCalDetails = encodeURIComponent(`Your Ticket ID: ${attendee.id}\nVenue: ${event.venueName}, ${event.venueAddress}\nDigital Ticket: ${ticketPageUrl}`);
  const gCalLocation = encodeURIComponent(`${event.venueName}, ${event.venueAddress}`);
  const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${gCalTitle}&details=${gCalDetails}&location=${gCalLocation}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Entry Ticket: ${event.title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #0b0f19;
      padding: 32px 12px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background: #131b2e;
      border: 1px solid #1e293b;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .banner {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%);
      padding: 36px 28px;
      text-align: center;
      color: #ffffff;
    }
    .badge {
      display: inline-block;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.4);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .title {
      font-size: 24px;
      font-weight: 800;
      line-height: 1.25;
      margin: 0 0 6px 0;
    }
    .organizer {
      font-size: 13px;
      opacity: 0.9;
      margin: 0;
    }
    .content {
      padding: 32px 28px;
    }
    .greeting {
      font-size: 16px;
      color: #cbd5e1;
      margin: 0 0 20px 0;
    }
    .ticket-card {
      background: #ffffff;
      color: #0f172a;
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      margin-bottom: 24px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .ticket-id {
      font-family: 'Courier New', Courier, monospace;
      font-size: 15px;
      font-weight: 800;
      color: #4f46e5;
      letter-spacing: 1.5px;
      margin-top: 8px;
    }
    .qr-box {
      margin: 16px auto;
      padding: 12px;
      background: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      display: inline-block;
    }
    .qr-img {
      display: block;
      width: 220px;
      height: 220px;
      margin: 0 auto;
    }
    .tier-badge {
      display: inline-block;
      background: #e0e7ff;
      color: #3730a3;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 14px;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .details-table td {
      padding: 10px 0;
      border-bottom: 1px solid #1e293b;
      font-size: 14px;
    }
    .details-table td.label {
      color: #94a3b8;
      width: 35%;
    }
    .details-table td.val {
      color: #f1f5f9;
      font-weight: 600;
    }
    .btn-container {
      text-align: center;
      margin: 28px 0 16px 0;
    }
    .btn {
      display: inline-block;
      background: #4f46e5;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
      padding: 14px 28px;
      border-radius: 10px;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
    }
    .btn-cal {
      display: inline-block;
      background: #1e293b;
      color: #cbd5e1 !important;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      padding: 10px 18px;
      border-radius: 8px;
      margin-top: 10px;
    }
    .footer {
      padding: 24px 28px;
      background: #0d121f;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      border-top: 1px solid #1e293b;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="banner">
        <div class="badge">Official Admission Pass</div>
        <h1 class="title">${event.title}</h1>
        <p class="organizer">Presented by ${event.organizer}</p>
      </div>

      <div class="content">
        <p class="greeting">Hello <strong>${attendee.fullName}</strong>,</p>
        <p style="font-size: 14px; color: #94a3b8; line-height: 1.5;">
          You are confirmed! Present the QR code below at the reception desk on event day for quick, zero-contact entry.
        </p>

        <div class="ticket-card">
          <span class="tier-badge">${attendee.ticketType}</span>
          <div class="ticket-id">${attendee.id}</div>
          
          <div class="qr-box">
            <img class="qr-img" src="${qrDataUrl}" alt="QR Entry Code" />
          </div>

          <p style="font-size: 11px; color: #64748b; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Zero-Click Scanner Ready &bull; High Contrast Pass
          </p>
        </div>

        <table class="details-table">
          <tr>
            <td class="label">Attendee</td>
            <td class="val">${attendee.fullName}</td>
          </tr>
          <tr>
            <td class="label">Date</td>
            <td class="val">${startDateFormatted}</td>
          </tr>
          <tr>
            <td class="label">Time</td>
            <td class="val">${startTimeFormatted}</td>
          </tr>
          <tr>
            <td class="label">Venue</td>
            <td class="val">${event.venueName}</td>
          </tr>
          <tr>
            <td class="label">Address</td>
            <td class="val">${event.venueAddress}, ${event.city}</td>
          </tr>
        </table>

        <div class="btn-container">
          <a class="btn" href="${ticketPageUrl}" target="_blank">
            Open Mobile Ticket
          </a>
          <br>
          <a class="btn-cal" href="${gCalUrl}" target="_blank">
            + Add to Google Calendar
          </a>
        </div>
      </div>

      <div class="footer">
        <p style="margin: 0 0 6px 0;">Need support? Contact your event organizer or reply to this email.</p>
        <p style="margin: 0;">Powered by Brand Activation Attendance System &bull; Fast-Track Admission</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
