const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outDir = fs.mkdtempSync(path.join("/tmp", "field-checkin-qa-"));

try {
  const tscBin = require.resolve("typescript/bin/tsc");
  execFileSync(
    process.execPath,
    [
      tscBin,
      path.join(projectRoot, "lib/geo.ts"),
      path.join(projectRoot, "lib/auth.ts"),
      path.join(projectRoot, "lib/survey-templates.ts"),
      "--outDir",
      outDir,
      "--module",
      "commonjs",
      "--target",
      "es2020",
      "--moduleResolution",
      "node",
      "--esModuleInterop",
      "--skipLibCheck",
    ],
    { stdio: "inherit" }
  );

  const {
    isValidCoordinates,
    calculateDistanceMeters,
    isPointInPolygon,
    evaluateGeofence,
    evaluateGpsTelemetry,
    formatDistance,
  } = require(path.join(outDir, "geo.js"));
  const {
    hashPassword,
    isHashedPassword,
    verifyPassword,
    createSessionToken,
    verifySessionToken,
    checkRateLimit,
    resetRateLimit,
    computeSha256Hex,
    sanitizeCampaignForPublic,
  } = require(path.join(outDir, "auth.js"));
  const { DEFAULT_HOSPITAL_QUESTIONS } = require(path.join(outDir, "survey-templates.js"));

  const results = [];

  function test(suite, name, fn) {
    try {
      fn();
      results.push({ suite, name, passed: true });
    } catch (err) {
      results.push({ suite, name, passed: false, error: err?.message || String(err) });
    }
  }

  // ── 1. GEOFENCE & COORDINATE QA ──
  test("Geofence", "Rejects invalid, NaN, out-of-range, and Null Island (0,0) coordinates", () => {
    assert.equal(isValidCoordinates(6.5244, 3.3792), true);
    assert.equal(isValidCoordinates(0, 0), false);
    assert.equal(isValidCoordinates(95, 3.3), false);
    assert.equal(isValidCoordinates(6.5, 190), false);
    assert.equal(isValidCoordinates(NaN, 3.3), false);
    assert.equal(isValidCoordinates(undefined, 3.3), false);
  });

  test("Geofence", "Calculates Haversine distance accurately", () => {
    const store = { latitude: 6.5702, longitude: 3.3496 };
    assert.equal(calculateDistanceMeters(store, store), 0);

    const near = calculateDistanceMeters({ latitude: 6.57035, longitude: 3.34972 }, store);
    assert.ok(near >= 15 && near <= 30, `Expected 15-30m, got ${near}m`);

    const far = calculateDistanceMeters({ latitude: 6.5757, longitude: 3.3544 }, store);
    assert.ok(far >= 700 && far <= 900, `Expected 700-900m, got ${far}m`);
  });

  test("Geofence", "Fails closed when store coordinates are missing/uncalibrated", () => {
    const res = evaluateGeofence(
      { latitude: 6.5702, longitude: 3.3496, accuracy: 10 },
      { latitude: NaN, longitude: NaN },
      200
    );
    assert.equal(res.inside, false);
    assert.equal(res.status, "out_of_bounds");
  });

  test("Geofence", "Rejects weak/coarse GPS fixes with accuracy > 150m", () => {
    const store = { latitude: 6.5702, longitude: 3.3496 };
    const res = evaluateGeofence(
      { latitude: 6.5702, longitude: 3.3496, accuracy: 220 },
      store,
      200
    );
    assert.equal(res.inside, false);
    assert.equal(res.status, "out_of_bounds");
    assert.match(res.message, /too weak/i);
  });

  test("Geofence", "Verifies on-site fix within radius", () => {
    const store = { latitude: 6.5702, longitude: 3.3496 };
    const res = evaluateGeofence(
      { latitude: 6.57035, longitude: 3.34972, accuracy: 12 },
      store,
      200
    );
    assert.equal(res.inside, true);
    assert.equal(res.status, "verified");
  });

  test("Geofence", "Marks bounded indoor drift (<= 50m beyond fence) as 'drift' and caps tolerance at 50m", () => {
    const store = { latitude: 6.5702, longitude: 3.3496 };
    const driftRes = evaluateGeofence(
      { latitude: 6.57227, longitude: 3.3496, accuracy: 40 },
      store,
      200
    );
    assert.equal(driftRes.inside, true);
    assert.equal(driftRes.status, "drift");

    const cappedRes = evaluateGeofence(
      { latitude: 6.57272, longitude: 3.3496, accuracy: 120 },
      store,
      200
    );
    assert.equal(cappedRes.inside, false);
    assert.equal(cappedRes.status, "out_of_bounds");
  });

  test("Geofence", "Supports polygon cluster geofence boundaries", () => {
    const poly = [
      { lat: 6.5, lng: 3.3 },
      { lat: 6.5, lng: 3.4 },
      { lat: 6.6, lng: 3.4 },
      { lat: 6.6, lng: 3.3 },
    ];
    assert.equal(isPointInPolygon({ latitude: 6.55, longitude: 3.35 }, poly), true);
    assert.equal(isPointInPolygon({ latitude: 6.65, longitude: 3.35 }, poly), false);
  });

  test("Geofence", "Formats distances cleanly", () => {
    assert.equal(formatDistance(45), "45m");
    assert.equal(formatDistance(1250), "1.3km");
    assert.equal(formatDistance(-1), "N/A");
  });

  // ── 2. ANTI-SPOOFING TELEMETRY QA ──
  test("Anti-Spoofing", "Detects stale GPS fix, future timestamp, static mock coordinates, and teleport jumps", () => {
    const now = Date.now();
    const clean = evaluateGpsTelemetry({ latitude: 6.57, longitude: 3.35, accuracy: 15, timestamp: now });
    assert.equal(clean.spoofRisk, "low");
    assert.equal(clean.freshnessOk, true);

    const future = evaluateGpsTelemetry({ latitude: 6.57, longitude: 3.35, accuracy: 15, timestamp: now + 60_000 });
    assert.equal(future.spoofRisk, "high");
    assert.equal(future.freshnessOk, false);

    const staticSamples = [
      { latitude: 6.5702, longitude: 3.3496, accuracy: 10, timestamp: now - 10_000 },
      { latitude: 6.5702, longitude: 3.3496, accuracy: 10, timestamp: now - 5_000 },
      { latitude: 6.5702, longitude: 3.3496, accuracy: 10, timestamp: now },
    ];
    const staticEval = evaluateGpsTelemetry(staticSamples[2], staticSamples, false);
    assert.equal(staticEval.spoofRisk, "medium");

    const teleportSamples = [
      { latitude: 6.5702, longitude: 3.3496, accuracy: 10, timestamp: now - 5_000 },
      { latitude: 6.5702, longitude: 3.3496, accuracy: 10, timestamp: now - 2_000 },
      { latitude: 6.6202, longitude: 3.3496, accuracy: 10, timestamp: now },
    ];
    const teleportEval = evaluateGpsTelemetry(teleportSamples[2], teleportSamples, false);
    assert.equal(teleportEval.spoofRisk, "high");
  });

  // ── 3. AUTH, CRYPTO & SANITIZATION QA ──
  test("Auth", "PBKDF2 password hashing, verification, and idempotency", () => {
    const hash = hashPassword("MySecret@2026");
    assert.equal(isHashedPassword(hash), true);
    assert.equal(hashPassword(hash), hash);
    assert.equal(verifyPassword("MySecret@2026", hash), true);
    assert.equal(verifyPassword("WrongPass", hash), false);
    assert.equal(verifyPassword("1234", "1234"), true);
  });

  test("Auth", "HMAC-SHA256 session tokens reject tampering and expiration", () => {
    const token = createSessionToken(
      { role: "ba", username: "ba1", campaignId: "cussons", storeCode: "clinic-1" },
      3600
    );
    const decoded = verifySessionToken(token);
    assert.ok(decoded);
    assert.equal(decoded.role, "ba");
    assert.equal(decoded.storeCode, "clinic-1");

    const [payload, sig] = token.split(".");
    assert.equal(verifySessionToken(`${payload}.${sig}x`), null);

    const expired = createSessionToken({ role: "superadmin", username: "admin" }, -10);
    assert.equal(verifySessionToken(expired), null);
  });

  test("Auth", "Rate limiter blocks after max attempts and resets cleanly", () => {
    const key = "qa-test-key";
    resetRateLimit(key);
    for (let i = 0; i < 3; i++) {
      assert.equal(checkRateLimit(key, 3, 60_000).allowed, true);
    }
    assert.equal(checkRateLimit(key, 3, 60_000).allowed, false);
    resetRateLimit(key);
    assert.equal(checkRateLimit(key, 3, 60_000).allowed, true);
  });

  test("Auth", "sanitizeCampaignForPublic strips all admin and store secrets", () => {
    const sanitized = sanitizeCampaignForPublic({
      id: "pz-cussons",
      name: "PZ Cussons",
      adminUsername: "sup",
      adminPassword: "secret-admin-password",
      adminPin: "9999",
      stores: [
        {
          id: "hosp-1",
          name: "General Hospital",
          pin: "1234",
          baPassword: "hashed:password",
          baUsername: "ba1",
        },
      ],
    });
    assert.equal("adminPassword" in sanitized, false);
    assert.equal("adminPin" in sanitized, false);
    assert.equal("pin" in sanitized.stores[0], false);
    assert.equal("baPassword" in sanitized.stores[0], false);
    assert.equal(sanitized.stores[0].hasPin, true);
  });

  test("Auth", "computeSha256Hex returns valid 64-char SHA-256 hex digest", () => {
    const digest = computeSha256Hex("data:image/jpeg;base64,abc123");
    assert.equal(digest.length, 64);
    assert.match(digest, /^[0-9a-f]{64}$/);
  });

  // ── 4. HOSPITAL SURVEY TEMPLATE QA ──
  test("Hospital Survey", "Default Cussons/Molfix hospital template has all 5 required questions", () => {
    assert.equal(DEFAULT_HOSPITAL_QUESTIONS.length, 5);
    assert.equal(DEFAULT_HOSPITAL_QUESTIONS[0].label, "MOTHER'S NAME");
    assert.equal(DEFAULT_HOSPITAL_QUESTIONS[1].label, "PHONE NO.");
    assert.equal(DEFAULT_HOSPITAL_QUESTIONS[2].label, "CLINIC");
    assert.deepEqual(DEFAULT_HOSPITAL_QUESTIONS[2].options, ["ANC", "IMC"]);
    assert.equal(DEFAULT_HOSPITAL_QUESTIONS[3].label, "HOSPITAL NAME");
    assert.equal(DEFAULT_HOSPITAL_QUESTIONS[3].autoFillStoreName, true);
    assert.equal(DEFAULT_HOSPITAL_QUESTIONS[4].type, "radio_consent");
    assert.equal(DEFAULT_HOSPITAL_QUESTIONS[4].options?.length, 2);
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed);
  console.log(`QA_SUMMARY: ${passed}/${results.length} PASSED, ${failed.length} FAILED`);
  for (const r of results) {
    console.log(
      `${r.passed ? "PASS" : "FAIL"} [${r.suite}] ${r.name}${r.error ? ` -> ${r.error}` : ""}`
    );
  }
  if (failed.length > 0) process.exitCode = 1;
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
