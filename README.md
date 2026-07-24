# Spin & Win — Campaign Wheel (Next.js + Firebase)

Public-facing spin-the-wheel flow for experiential marketing activations:
**Welcome → Registration → Spin → Winner reveal**, backed by Firestore so
prizes and odds live in the database instead of the code.

This build covers the public participant flow only (not the admin dashboard
or analytics). It's structured so campaign config is fully data-driven —
an admin panel can be added later without touching this app.

## What's included

- Next.js 14 (App Router) + TypeScript
- Canvas-based spin wheel with weighted-probability prize selection and
  smooth, physically-eased animation
- Registration form (name, phone, optional email) with validation
- Optional "one spin per phone number" enforcement, checked against Firestore
- Winner/loser reveal modal
- Firestore security rules that keep participant data write-only from the
  client (no one can read other players' data or tamper with results)
- Fully theatable per campaign: logo, colors, welcome copy, prize list, all
  from one Firestore document — so the same app can be reused across clients
  by swapping the `campaignId`

## 1. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com) and
   create a new project (or reuse an existing one).
2. Enable **Firestore Database** (Build > Firestore Database > Create database,
   start in production mode).
3. Go to **Project settings > General > Your apps**, add a **Web app**, and
   copy the config values.

## 2. Configure the app

```bash
cp .env.local.example .env.local
```

Fill in the Firebase values from step 1, plus `NEXT_PUBLIC_CAMPAIGN_ID`
(the Firestore document ID this deployment should load — see step 3).

## 3. Create a campaign document

In Firestore, create a collection called `campaigns`, then a document whose
ID matches `NEXT_PUBLIC_CAMPAIGN_ID` (e.g. `demo-campaign`). Use the shape in
[`seed/demo-campaign.json`](seed/demo-campaign.json) as a starting point —
you can paste values in directly via the Firebase console, or use the
optional [`seed/seed.js`](seed/seed.js) script to upload it programmatically.

Field reference:

| Field              | Type    | Notes                                              |
|--------------------|---------|-----------------------------------------------------|
| `name`             | string  | Shown at the top of the app                        |
| `logoUrl`          | string  | Optional, shown above the campaign name             |
| `primaryColor`     | string  | Hex, used for buttons, accents, and the ambient glow |
| `welcomeMessage`   | string  | Shown under the campaign name on the registration screen |
| `oneSpinPerPhone`  | boolean | If true, blocks repeat entries by phone number      |
| `active`           | boolean | Set to false to take the wheel offline               |
| `prizes`           | array   | See below                                           |

Each prize object:

```json
{ "id": "sanitizer", "label": "Hand Sanitizer", "color": "#0E7C7B", "weight": 20, "isLosing": false }
```

`weight` is a relative probability — the six example weights (2, 5, 20, 10,
60, 3) don't need to sum to 100, they're normalized automatically. Mark
non-winning segments (e.g. "Try Again") with `"isLosing": true`.

## 4. Apply Firestore security rules

Copy the contents of [`firestore.rules`](firestore.rules) into
Firebase console > Firestore Database > Rules, and publish. This makes
campaign config public-read-only and participant records write-only (no
client can read back the participant list — use the Firebase console or a
future admin export for that).

## 5. Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. On a phone/tablet at an event, this URL (or a QR
code pointing to it) is the whole experience.

## Data model recap

```
campaigns/{campaignId}          — one doc per client/campaign, public read
participants/{autoId}           — one doc per completed spin, write-only from client
  { name, phone, email?, campaignId, prizeId, prizeLabel, won, createdAt }
```

## Not included in this pass (available on request)

- Admin dashboard (edit prizes/odds/branding, view/export participants)
- Analytics (spins over time, prize distribution, daily reports)
- QR code generator, SMS/email winner notifications, TV display mode

These all read/write the same `campaigns` and `participants` collections
above, so they can be layered on without changing this app's data shape.
