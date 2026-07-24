/**
 * Optional helper to upload a campaign JSON file into Firestore using the
 * Firebase Admin SDK. Requires a service account key — do NOT commit that
 * key or expose it in the Next.js app itself, it's for one-off local use only.
 *
 * Setup:
 *   1. Firebase console > Project settings > Service accounts > Generate new private key
 *   2. Save it as seed/serviceAccountKey.json (already gitignored)
 *   3. npm install firebase-admin --no-save
 *   4. node seed/seed.js demo-campaign seed/demo-campaign.json
 */
const admin = require("firebase-admin");
const path = require("path");

const [, , campaignId, jsonPath] = process.argv;

if (!campaignId || !jsonPath) {
  console.error("Usage: node seed/seed.js <campaignId> <path-to-campaign.json>");
  process.exit(1);
}

const serviceAccount = require(path.resolve(__dirname, "serviceAccountKey.json"));
const campaignData = require(path.resolve(jsonPath));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

admin
  .firestore()
  .collection("campaigns")
  .doc(campaignId)
  .set(campaignData)
  .then(() => {
    console.log(`Campaign "${campaignId}" uploaded.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
