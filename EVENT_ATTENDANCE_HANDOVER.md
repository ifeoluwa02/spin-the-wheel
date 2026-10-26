# 🎟️ Passflow: Event Attendance & Zero-Click Admission System
## Master Handover & Architecture Document

**Date:** October 26, 2026  
**Git Branch:** `feature/event-attendance` (Branched from `feature/monorepo-field-checkin`)  
**Monorepo Workspace:** `apps/event-attendance`  
**Default Dev Port:** `3002` (Orchestrated alongside Port 3000 `spin-the-wheel` & Port 3001 `field-checkin`)  
**Design Standard:** Minimalist Light SaaS Theme (Zedda-inspired split 2-column layout with 3D clay asset)

---

## 1. Executive Overview & Problem Statement

Event activations and corporate conferences in Nigeria (e.g., Nestlé Field Summits, Product Launches, Tech Conferences) suffer from heavy entrance bottlenecks: attendees wait in long queues while usher staff manually scroll spreadsheets or tap buttons to verify names.

**Passflow** solves this end-to-end:
1. **Attendee Flow:** Attendee fills a clean, modern registration form $\rightarrow$ gets an instant, high-contrast QR pass on-screen + an automated branded HTML email with calendar sync.
2. **Zero-Click Gate Flow:** Gate staff point a mobile or webcam scanner at the attendee's phone/printout $\rightarrow$ camera decodes immediately, validates the ticket, plays a turnstile audio chime, flashes an "ADMITTED" banner, and auto-resumes for the next attendee in 1.8 seconds **with zero button taps**.
3. **Admin & Operations Flow:** Event managers create events, monitor live turnout rates (%), search attendees in real time, and export admission logs to CSV.

---

## 2. Monorepo Context & Directory Structure

This project lives inside the root monorepo alongside the other activation platforms:

```text
spin-the-wheel/ (Monorepo root)
├── apps/
│   ├── spin-the-wheel/            # [Port 3000] Consumer Raffle Game
│   ├── field-checkin/             # [Port 3001] Field Staff GPS Check-in & Watermark Camera
│   └── event-attendance/          # [Port 3002] Event Registration & QR Check-In (Passflow)
│       ├── app/
│       │   ├── page.tsx           # Platform Discovery & Registration entrance
│       │   ├── e/[slug]/page.tsx  # Dedicated Closed Event Registration (No dropdown)
│       │   ├── scan/page.tsx      # Zero-Click Continuous Camera Scanner (?event= locked)
│       │   ├── admin/page.tsx     # Admin Operations, Event Creator & 1-Click Link Copy
│       │   ├── ticket/[ticketId]/ # Mobile Digital Pass view (bookmarkable / shareable)
│       │   ├── api/
│       │   │   ├── register/      # Registration + Email dispatch API
│       │   │   ├── admit/         # Atomic gate admission & duplicate checker
│       │   │   └── events/        # Events listing & creation API ([slug] lookup)
│       │   ├── globals.css        # Clean light styling, scanner crosshairs & animations
│       │   └── layout.tsx         # Root light layout and header
│       ├── components/
│       │   ├── Navbar.tsx         # Minimalist header with Zedda-inspired geometric brand
│       │   └── EventRegistrationView.tsx # Core view supporting locked & discovery modes
│       ├── lib/
│       │   ├── types.ts           # Event, Attendee, CheckinResult TypeScript models
│       │   ├── email-template.ts  # Responsive HTML email with embedded QR & Cal link
│       │   ├── audio.ts           # Web Audio API turnstile chimes (ding & warning buzz)
│       │   ├── repository.ts      # Dual-mode store (Local memory + Firebase Firestore)
│       │   └── firebase.ts        # Resilient Firebase client setup
│       ├── public/
│       │   └── hero-ticket-3d.jpg # 3D clay-style VIP badge illustration asset
│       ├── package.json           # Port 3002 scripts and dependencies
│       ├── tailwind.config.js     # Light theme configuration
│       └── next.config.js         # Production Next.js config
├── packages/
│   └── shared/                    # Shared Nigerian states and utilities
└── package.json                   # Root workspace scripts (dev:attendance, build:attendance)
```

---

## 3. Design System & Visual Aesthetics

Based on direct feedback, the user interface rejects dark "neon sci-fi" aesthetics in favor of a **clean, minimalist fintech/SaaS light theme** modeled after **Zedda**:

- **Color Palette:** Pure white background (`#ffffff`), dark navy headlines (`#0b1a3d` / `#0f172a`), subtle slate borders (`#e2e8f0`), and vibrant electric blue/sky accents (`#2563eb` $\rightarrow$ `#0ea5e9`).
- **Left Editorial Column:**
  - Modern geometric brand mark (blue skewed dual stripes).
  - Carousel indicator pill (`••—`).
  - Bold, high-contrast headline: *"Seamless Check-In & Real-Time Passes"*.
  - Custom-generated **3D clay-style VIP pass & smartphone QR illustration** matching the 3D clay safe in Zedda.
  - Live event summary pill (Date, Time, Venue).
- **Right Registration Card:**
  - Clean, spacious form with festive emoji badge (`🎉`).
  - Light, rounded input boxes with subtle focus rings (`focus:ring-blue-50 focus:border-blue-600`).
  - Full-width electric blue gradient action button with active click animations.

---

## 4. Completed & Implemented Features

### A. Attendee Registration Portal (`/`)
- **File:** `apps/event-attendance/app/page.tsx`
- **Features:**
  - Dynamic event switcher (select between available events).
  - Full registration fields: Full Name, Email, Phone, Organization, and Pass Tier (`General Admission`, `VIP`, `Speaker`, `Exhibitor`).
  - Form validation with error feedback.
  - Instant digital ticket generation with high-contrast QR code (`QRCodeSVG`).
  - Confetti burst celebration on successful ticket creation.
  - In-app **"Preview Email" modal** allowing users to inspect the exact transactional email without opening an email client.
  - Direct links to **"Mobile Pass"** and browser **"Print / Save PDF"**.

### B. Transactional Email Generator & Engine
- **Files:**
  - `apps/event-attendance/lib/email-template.ts`
  - `apps/event-attendance/app/api/register/route.ts`
- **Features:**
  - Mobile-responsive, single-file HTML email template.
  - High-contrast QR code rendered via public API (`api.qrserver.com`) for direct Gmail/Outlook image rendering without clipping.
  - Direct **"+ Add to Google Calendar"** button pre-populated with event title, details, and venue address.
  - Direct **"Open Mobile Ticket"** button.
  - Production Resend API integration (triggers automatically if `RESEND_API_KEY` is set; falls back gracefully to preview mode if unset).

### C. Zero-Click Continuous Gate Scanner (`/scan`)
- **Files:**
  - `apps/event-attendance/app/scan/page.tsx`
  - `apps/event-attendance/lib/audio.ts`
  - `apps/event-attendance/app/api/admit/route.ts`
- **Features:**
  - **Zero Button Taps:** Camera stream runs continuously at 15 fps. As soon as a QR enters the viewfinder, it decodes and submits immediately.
  - **In-Browser Web Audio Synthesizer:**
    - **Valid Admission:** Turnstile chime note (`880Hz` $\rightarrow$ `1108Hz`) + confetti burst + full-screen green badge.
    - **Duplicate Admission:** Low sawtooth warning buzz (`180Hz` $\rightarrow$ `140Hz`) + amber banner (*"Already checked in at 09:12 AM"*).
    - **Invalid / Wrong Event:** Error buzz + red rejection badge.
  - **Auto-Resume Loop:** Freezes frame for 1.8 seconds with an on-screen countdown so gate guards can read attendee name and tier, then automatically resumes continuous scanning.
  - **Manual Fallback Input:** Allows gate staff to type a ticket ID (e.g. `TKT-LAG-1001`) if an attendee's phone screen is cracked or unreadable.
  - **Recent Activity Strip:** Displays the last 10 admitted attendees live at the bottom of the scanner.

### D. Mobile Digital Ticket View (`/ticket/[ticketId]`)
- **File:** `apps/event-attendance/app/ticket/[ticketId]/page.tsx`
- **Features:**
  - Clean, dedicated mobile pass page for attendees opening their ticket from an email or WhatsApp link.
  - High-contrast QR code with maximum screen brightness compatibility.
  - Live check-in status chip (*"Confirmed & Ready"* vs *"Admitted at [time]"*).
  - Native browser Web Share API integration (share to WhatsApp/Telegram or copy link).

### E. Admin Operations & Registry Dashboard (`/admin`)
- **Files:**
  - `apps/event-attendance/app/admin/page.tsx`
  - `apps/event-attendance/app/api/events/route.ts`
- **Features:**
  - **Live Metric Cards:** Total Registered, Admitted (Checked In), Pending Arrival, and Live Turnout Rate (%) progress bar.
  - **Create Event Modal:** Publish new events with title, organizer, category, venue name, street address, dates, and seat capacity.
  - **Search & Filter Table:** Filter by status (`All`, `Admitted`, `Pending`), pass tier (`General Admission`, `VIP`, `Speaker`, `Exhibitor`), or live search by name, email, company, or ticket ID.
  - **1-Click CSV Export:** Downloads an Excel-ready `.csv` file with complete attendee rosters and check-in timestamps.

### F. Dual-Mode Persistence Architecture
- **File:** `apps/event-attendance/lib/repository.ts`
- **Features:**
  - Supports **Firebase Firestore** when Firebase keys are provided in `.env.local`.
  - Seamlessly falls back to **In-Memory & LocalStorage** with pre-seeded demo events (`Nestlé Brand Activation & Retail Summit 2026`) and sample attendees so the application works out-of-the-box in local development with 0 configuration.

---

## 5. Pipeline Roadmap (What Is Yet To Do & Suggested Next Steps)

Here are the prioritized enhancements ready for implementation:

| Priority | Feature / Module | Purpose & Implementation Details |
| :--- | :--- | :--- |
| **P0** | **Production Email Service (Resend / SendGrid / SES)** | Configure a verified custom domain (e.g. `tickets@yourdomain.com`) with SPF, DKIM, and DMARC records to ensure 100% inbox placement without landing in spam. |
| **P1** | **HMAC-SHA256 Cryptographic QR Signing** | Replace plain ticket IDs with signed cryptographic payloads (`ticketId:signature`) so attendees cannot forge or manipulate ticket QR codes. |
| **P2** | **Offline PWA & Local IndexedDB Queue** | Venues often have dead cell reception. Implement a Service Worker + IndexedDB queue that stores check-ins offline on the scanner device and syncs to the server when connection restores. |
| **P3** | **WhatsApp Ticket Delivery (Twilio / Termii)** | In Nigeria, many attendees don't check email regularly. Add WhatsApp Business API dispatch to send the ticket QR and venue details directly to the attendee's phone number. |
| **P4** | **Multi-Gate Terminal Tagging** | Allow scanners to specify gate names (e.g. *"Gate 1 - Main Entrance"*, *"VIP Lounge Entrance"*, *"Exhibitor Gate"*) and record `checkedInBy` accordingly in analytics. |
| **P5** | **Zebra / Brother Thermal Badge Printing** | Connect WebUSB / ESC-POS thermal badge printers so that the moment the zero-click scanner admits an attendee, a physical name sticker prints automatically. |
| **P6** | **MongoDB / PostgreSQL Migration** | If migrating away from Firestore, swap `repository.ts` to Prisma / Mongoose with indexed `ticketId` and `eventId` collections. |
| **P7** | **Cloud Deployment Pipeline** | Deploy to Vercel or Firebase App Hosting with environment variables (`RESEND_API_KEY`, `FIREBASE_*`). |

---

## 6. Developer Quickstart & Command Reference

### Starting the Applications

From the monorepo root (`/Users/olawooreifeoluwa/Documents/GitHub/spin-the-wheel`):

```bash
# Start Event Attendance App (Port 3002)
npm run dev:attendance

# Start Field Check-in App (Port 3001)
npm run dev:checkin

# Start Spin the Wheel App (Port 3000)
npm run dev:spin
```

### Production Build & Verification

```bash
# Build Event Attendance App
npm run build:attendance

# Build all monorepo apps
npm run build
```

### Key URLs (Local Port 3002)

- **Dedicated Event Page (Closed Mode, No Dropdown):** [http://localhost:3002/e/nestle-summit-2026](http://localhost:3002/e/nestle-summit-2026)
- **Second Dedicated Event Page:** [http://localhost:3002/e/tech-africa-lagos](http://localhost:3002/e/tech-africa-lagos)
- **General Platform Entrance (Discovery Mode):** [http://localhost:3002](http://localhost:3002)
- **Dedicated Locked Gate Scanner:** [http://localhost:3002/scan?event=nestle-summit-2026](http://localhost:3002/scan?event=nestle-summit-2026)
- **Admin & Attendee Table (with 1-Click Link Copy):** [http://localhost:3002/admin](http://localhost:3002/admin)
- **Sample Mobile Pass:** [http://localhost:3002/ticket/TKT-LAG-1001](http://localhost:3002/ticket/TKT-LAG-1001)

### Key Git Commits on `feature/event-attendance`

- **`e5b68a7`:** Scaffolding of `apps/event-attendance`, API routes, audio synthesizer, zero-click scanner, and admin dashboard.
- **`0f71882`:** Full redesign to clean light SaaS theme matching Zedda layout with 3D clay ticket asset.

---
*Handover document generated and committed to the project repository for seamless context continuity.*
