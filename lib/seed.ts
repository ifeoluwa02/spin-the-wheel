/**
 * seed.ts — PRODUCTION BUILD
 * All demo / sample data has been removed.
 * Campaigns are created exclusively via the /create-campaign UI.
 * This file is kept as a no-op so existing imports don't break.
 */

export async function seedFirebaseData(): Promise<{ campaignsSeeded: number; participantsSeeded: number }> {
  console.warn("seedFirebaseData() is disabled in production — use /create-campaign to set up a campaign.");
  return { campaignsSeeded: 0, participantsSeeded: 0 };
}
