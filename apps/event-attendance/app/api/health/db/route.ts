import { NextRequest, NextResponse } from "next/server";
import { pingMongoDb, getMongoDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const ping = await pingMongoDb();
    if (!ping.connected) {
      return NextResponse.json(
        {
          connected: false,
          driver: "mongodb",
          error: ping.error,
          configured: Boolean(process.env.MONGODB_URI),
          tip: "Add MONGODB_URI to your .env.local file (e.g. mongodb+srv://... or mongodb://localhost:27017/passflow)",
        },
        { status: 200 }
      );
    }

    const db = await getMongoDb();
    let eventsCount = 0;
    let attendeesCount = 0;

    if (db) {
      eventsCount = await db.collection("events").countDocuments().catch(() => 0);
      attendeesCount = await db.collection("attendees").countDocuments().catch(() => 0);
    }

    return NextResponse.json({
      connected: true,
      driver: "mongodb",
      dbName: ping.dbName,
      latencyMs: ping.latencyMs,
      stats: {
        eventsCount,
        attendeesCount,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        connected: false,
        error: err instanceof Error ? err.message : "Database health check failed",
      },
      { status: 500 }
    );
  }
}

