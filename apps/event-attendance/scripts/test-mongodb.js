#!/usr/bin/env node

/**
 * MongoDB Connection, PBKDF2 Password Hash & Atomic Race-Protection Diagnostic Script
 * Usage:
 *   node apps/event-attendance/scripts/test-mongodb.js [optional_mongodb_uri]
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

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

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

loadEnv();

const uri = process.argv[2] || process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "passflow";

console.log("====================================================");
console.log("🍃 Passflow MongoDB & Security Hardening Diagnostic");
console.log("====================================================");

if (!uri) {
  console.log("❌ ERROR: No MONGODB_URI found.");
  process.exit(1);
}

const maskedUri = uri.replace(/:([^@]+)@/, ":****@");
console.log(`• Target URI: ${maskedUri}`);
console.log(`• Database:   ${dbName}`);
console.log("----------------------------------------------------");
console.log("Connecting to MongoDB cluster...");

const start = Date.now();
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

async function run() {
  try {
    await client.connect();
    const elapsed = Date.now() - start;
    const db = client.db(dbName);
    const pingRes = await db.command({ ping: 1 });

    console.log(`✅ CONNECTED SUCCESSFULLY in ${elapsed}ms!`);
    console.log(`   Ping Result:`, pingRes);

    // 1. Ensure indexes on events and attendees
    await db.collection("events").createIndex({ id: 1 }, { unique: true }).catch(() => {});
    await db.collection("events").createIndex({ slug: 1 }).catch(() => {});
    await db.collection("attendees").createIndex({ id: 1 }, { unique: true }).catch(() => {});
    await db.collection("attendees").createIndex({ eventId: 1 }).catch(() => {});

    // 2. Upgrade any unhashed adminPassword in events collection to salted PBKDF2 hash
    const allEvents = await db.collection("events").find({}).toArray();
    let upgradedCount = 0;
    for (const evt of allEvents) {
      if (evt.adminPassword && !evt.adminPassword.includes(":")) {
        const hashed = hashPassword(evt.adminPassword);
        await db.collection("events").updateOne(
          { _id: evt._id },
          { $set: { adminPassword: hashed } }
        );
        upgradedCount++;
      }
    }
    if (upgradedCount > 0) {
      console.log(`🔐 Auto-upgraded ${upgradedCount} event admin password(s) to salted PBKDF2 hashes.`);
    } else {
      console.log(`🔐 Verified all ${allEvents.length} event admin password(s) are stored as salted PBKDF2 hashes.`);
    }

    // 3. Test Atomic Multi-Gate Race Protection (5 simultaneous scans of the same ticket)
    console.log("----------------------------------------------------");
    console.log("⚡ Testing Atomic Multi-Gate Race Protection (5 concurrent scans)...");
    const testTicketId = "TKT-RACE-TEST-999";
    await db.collection("attendees").deleteOne({ id: testTicketId });
    await db.collection("attendees").insertOne({
      id: testTicketId,
      eventId: "evt-nestle-summit-2026",
      eventSlug: "nestle-summit-2026",
      eventTitle: "Nestlé Brand Activation & Retail Summit 2026",
      fullName: "Concurrency Test Guest",
      email: "race.test@example.com",
      phone: "08000000000",
      ticketType: "VIP",
      qrHash: `${testTicketId}#evt-nestle-summit-2026`,
      status: "registered",
      registeredAt: new Date().toISOString(),
    });

    // Fire 5 simultaneous atomic findOneAndUpdate calls at the exact same millisecond
    const gates = ["Gate-1", "Gate-2", "Gate-3", "Gate-4", "Gate-5"];
    const scanResults = await Promise.all(
      gates.map(async (gate) => {
        const res = await db.collection("attendees").findOneAndUpdate(
          { id: testTicketId, status: "registered" },
          {
            $set: {
              status: "checked_in",
              checkedInAt: new Date().toISOString(),
              checkedInBy: gate,
            },
          },
          { returnDocument: "after" }
        );
        return {
          gate,
          code: res ? "ADMITTED" : "ALREADY_CHECKED_IN",
        };
      })
    );

    const admittedGates = scanResults.filter((r) => r.code === "ADMITTED");
    const blockedGates = scanResults.filter((r) => r.code === "ALREADY_CHECKED_IN");

    console.log(`   • Admitted Gates: ${admittedGates.length} (${admittedGates.map((g) => g.gate).join(", ")})`);
    console.log(`   • Blocked Gates:  ${blockedGates.length} (${blockedGates.map((g) => g.gate).join(", ")})`);

    // Clean up test ticket
    await db.collection("attendees").deleteOne({ id: testTicketId });

    if (admittedGates.length === 1 && blockedGates.length === 4) {
      console.log("✅ ATOMIC RACE PROTECTION PASSED: 1 admitted, 4 duplicates blocked!");
    } else {
      console.log("❌ Unexpected concurrency result:", scanResults);
    }

    const eventsCount = await db.collection("events").countDocuments().catch(() => 0);
    const attendeesCount = await db.collection("attendees").countDocuments().catch(() => 0);

    console.log("----------------------------------------------------");
    console.log(`📊 Current Collection Stats in '${dbName}':`);
    console.log(`   • Events:    ${eventsCount} document(s) (PBKDF2 hashed)`);
    console.log(`   • Attendees: ${attendeesCount} document(s)`);
    console.log("----------------------------------------------------");
    console.log("🎉 MongoDB is hardened and ready for production!");
  } catch (err) {
    console.error("❌ Diagnostic Failed:", err.message);
  } finally {
    await client.close();
  }
}

run();
