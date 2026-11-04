#!/usr/bin/env node

/**
 * Resend Email Test Script
 * Usage:
 *   node scripts/test-resend.js [recipient_email]
 * Example:
 *   node scripts/test-resend.js bigjarvis2004@gmail.com
 */

const fs = require("fs");
const path = require("path");

// Load .env.local if present
function loadEnv() {
  const candidates = [
    path.join(__dirname, "../.env.local"),
    path.join(__dirname, "../../.env.local"),
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "apps/event-attendance/.env.local"),
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const idx = trimmed.indexOf("=");
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const apiKey = process.env.RESEND_API_KEY;
const recipient = process.argv[2] || "bigjarvis2004@gmail.com";
const fromEmail = process.env.EMAIL_FROM || "Events <onboarding@resend.dev>";

console.log("====================================================");
console.log("🚀 Passflow Resend Email Dispatcher");
console.log("====================================================");
console.log(`• Target Recipient: ${recipient}`);
console.log(`• Sender Address:   ${fromEmail}`);
console.log(`• API Key Detected: ${apiKey ? apiKey.slice(0, 10) + "..." : "❌ NOT FOUND"}`);
console.log("----------------------------------------------------");

if (!apiKey) {
  console.error("❌ ERROR: No RESEND_API_KEY found in environment or .env.local");
  process.exit(1);
}

const payload = {
  from: fromEmail,
  to: [recipient],
  subject: "🎟️ Your VIP Admission Ticket: Nestlé Brand Summit 2026",
  html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0f19; padding: 24px; border-radius: 18px; max-width: 540px; margin: 0 auto; color: #e2e8f0;">
      <div style="background: linear-gradient(135deg, #2563eb 0%, #4f46e5 50%, #7c3aed 100%); padding: 24px 20px; border-radius: 12px; text-align: center; color: #ffffff; margin-bottom: 20px;">
        <span style="display: inline-block; background: rgba(255, 255, 255, 0.2); padding: 3px 10px; border-radius: 9999px; font-size: 10px; font-weight: 700; text-transform: uppercase;">
          Official Admission Pass
        </span>
        <h2 style="font-size: 20px; font-weight: 800; margin: 8px 0 4px 0;">Nestlé Annual Innovation Summit 2026</h2>
        <p style="font-size: 12px; opacity: 0.9; margin: 0;">Presented by Nestlé Nigeria Field Marketing</p>
      </div>

      <p style="font-size: 15px; color: #cbd5e1;">Hello <strong>Jarvis</strong>,</p>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
        This is a live test from Passflow using the Resend API. Your admission QR pass is ready for check-in:
      </p>

      <div style="background: #ffffff; color: #0f172a; border-radius: 14px; padding: 20px; text-align: center; margin: 20px 0;">
        <span style="display: inline-block; background: #dbeafe; color: #1e40af; font-size: 11px; font-weight: 700; padding: 3px 12px; border-radius: 9999px; text-transform: uppercase;">
          VIP Access Pass
        </span>
        <div style="font-family: monospace; font-size: 16px; font-weight: 800; color: #2563eb; margin: 10px 0 6px 0;">
          TCK-JARVIS-2026
        </div>
        <div style="margin: 12px auto; display: inline-block;">
          <img 
            src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=TCK-JARVIS-2026&margin=10" 
            alt="QR Pass" 
            width="200" 
            height="200" 
            style="display: block;"
          />
        </div>
        <p style="font-size: 10px; color: #64748b; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">
          Zero-Click Gate Ready
        </p>
      </div>

      <p style="font-size: 11px; color: #64748b; text-align: center;">
        Powered by Passflow &bull; Fast-Track Event Admission
      </p>
    </div>
  `,
};

console.log("📡 Sending request to https://api.resend.com/emails ...");

fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
})
  .then(async (res) => {
    const data = await res.json().catch(() => ({}));
    console.log("----------------------------------------------------");
    console.log(`HTTP Status: ${res.status} ${res.statusText}`);
    console.log("Response Body:", JSON.stringify(data, null, 2));
    console.log("----------------------------------------------------");

    if (res.ok) {
      console.log(`✅ SUCCESS! Email delivered to ${recipient}`);
      console.log(`📬 Message ID: ${data.id}`);
    } else {
      console.log(`⚠️ RESEND RESTRICTION DETECTED:`);
      if (res.status === 403 && data.message && data.message.includes("testing emails to your own email address")) {
        console.log(`\n👉 EXPLANATION:`);
        console.log(`Resend's free tier currently blocks sending from 'onboarding@resend.dev' to ${recipient}.`);
        console.log(`It only delivers to the owner of this API key (${data.message.match(/olawoore[^\)]+/)?.[0] || "account owner"}).`);
        console.log(`\nTo make this script deliver directly to ${recipient}:`);
        console.log(`1. Create a free Resend account with ${recipient} and replace the RESEND_API_KEY.`);
        console.log(`OR 2. Add and verify any custom domain at https://resend.com/domains.`);
      }
    }
  })
  .catch((err) => {
    console.error("❌ Network / Fetch Error:", err);
  });

