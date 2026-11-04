import { MongoClient, Db, MongoClientOptions } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "passflow";

const MONGO_OPTIONS: MongoClientOptions = {
  maxPoolSize: 20,
  minPoolSize: 1,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 8000,
};

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;
let indexesEnsured = false;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _mongoIndexesEnsured: boolean | undefined;
}

/**
 * Ensures compound and unique indexes exist for O(1) lookups at high scale (10,000+ attendees).
 */
async function ensureProductionIndexes(db: Db): Promise<void> {
  if (indexesEnsured || global._mongoIndexesEnsured) return;
  indexesEnsured = true;
  global._mongoIndexesEnsured = true;

  try {
    await Promise.all([
      db.collection("events").createIndex({ id: 1 }, { unique: true }),
      db.collection("events").createIndex({ slug: 1 }),
      db.collection("attendees").createIndex({ id: 1 }, { unique: true }),
      db.collection("attendees").createIndex({ eventId: 1, email: 1 }),
      db.collection("attendees").createIndex({ eventId: 1, status: 1 }),
      db.collection("attendees").createIndex({ eventId: 1, registeredAt: -1 }),
      db.collection("email_queue").createIndex({ id: 1 }, { unique: true }),
      db.collection("email_queue").createIndex({ status: 1, scheduledFor: 1 }),
    ]);
  } catch (err) {
    console.warn("MongoDB index initialization note:", err);
  }
}

/**
 * Returns a cached MongoDB client promise.
 * In development, uses a global variable so the MongoClient instance
 * is preserved across HMR (Hot Module Replacement) reloads.
 */
export function getMongoClientPromise(): Promise<MongoClient> | null {
  if (!uri) {
    return null;
  }

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, MONGO_OPTIONS);
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  } else {
    if (!clientPromise) {
      client = new MongoClient(uri, MONGO_OPTIONS);
      clientPromise = client.connect();
    }
    return clientPromise;
  }
}

/**
 * Convenience helper to get the connected database instance.
 * Returns null if MONGODB_URI is not configured.
 */
export async function getMongoDb(): Promise<Db | null> {
  const promise = getMongoClientPromise();
  if (!promise) return null;
  try {
    const connectedClient = await promise;
    const db = connectedClient.db(dbName);
    ensureProductionIndexes(db).catch(() => {});
    return db;
  } catch (err) {
    console.warn("⚠️ MongoDB connection failed:", err);
    return null;
  }
}

/**
 * Quick diagnostic ping to verify database connectivity.
 */
export async function pingMongoDb(): Promise<{
  connected: boolean;
  dbName?: string;
  error?: string;
  latencyMs?: number;
}> {
  const start = Date.now();
  try {
    const db = await getMongoDb();
    if (!db) {
      return {
        connected: false,
        error: "MONGODB_URI is not defined in environment variables.",
      };
    }
    await db.command({ ping: 1 });
    return {
      connected: true,
      dbName,
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Unknown MongoDB connection error",
      latencyMs: Date.now() - start,
    };
  }
}
