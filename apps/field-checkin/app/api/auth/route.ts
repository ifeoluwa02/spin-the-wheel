import { NextRequest, NextResponse } from "next/server";
import {
  getCampaign,
  getStoreTodayCheckIn,
  getTodayDateStr,
  getSuperAdminConfig,
  saveSuperAdminConfig,
} from "@/lib/repository";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  getRequestSession,
  setSessionCookie,
  clearSessionCookies,
  BA_SHIFT_COOKIE_NAME,
  checkRateLimit,
  resetRateLimit,
  getClientIp,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth
 * - With `?checkSetup=1`: returns whether the one-time Superadmin password setup has been completed.
 * - Otherwise: verifies the active HttpOnly session cookie or Bearer token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("checkSetup") === "1") {
    const cfg = await getSuperAdminConfig();
    return NextResponse.json({
      setupCompleted: Boolean(cfg?.setupCompleted),
      username: cfg?.username || null,
    });
  }

  if (searchParams.get("role") === "ba") {
    const authHeader = request.headers.get("authorization");
    const bearer = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : undefined;
    const baCookie = request.cookies.get(BA_SHIFT_COOKIE_NAME)?.value;
    const baSession = verifySessionToken(bearer || baCookie);
    if (!baSession || baSession.role !== "ba") {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    return NextResponse.json({
      authenticated: true,
      user: baSession,
    });
  }

  const session = getRequestSession(request, true);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: session,
  });
}

/**
 * DELETE /api/auth?role=ba|admin
 * Clears session cookies on logout (scoped so BA sign-out does not clear Superadmin/Supervisor).
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const roleParam = searchParams.get("role");
  const scope =
    roleParam === "ba"
      ? "ba"
      : roleParam === "admin" || roleParam === "supervisor" || roleParam === "superadmin"
      ? "admin"
      : "all";
  const res = NextResponse.json({ success: true });
  clearSessionCookies(res, scope);
  return res;
}

/**
 * POST /api/auth
 * Handles:
 *  1. `action: "setup_superadmin"` — One-time Superadmin password setup (locks automatically after first run).
 *  2. Superadmin or Campaign Supervisor authentication with rate limiting and HttpOnly cookies.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ── 0. ONE-TIME SUPERADMIN PASSWORD SETUP ──
    if (body.action === "setup_superadmin") {
      const ip = getClientIp(request);
      const setupRate = checkRateLimit(`setup:${ip}`, 6, 15 * 60 * 1000);
      if (!setupRate.allowed) {
        return NextResponse.json(
          { error: `Too many setup attempts. Retry in ${setupRate.retryAfterSec}s.` },
          { status: 429 }
        );
      }

      const newUsername = String(body.username || "superadmin").trim().toLowerCase();
      const newPassword = String(body.password || "").trim();
      const currentPassword = String(body.currentPassword || "").trim();

      if (
        newUsername.length < 3 ||
        newUsername.length > 60 ||
        !/^[a-z0-9._-]{3,60}$/.test(newUsername)
      ) {
        return NextResponse.json(
          { error: "Username must be 3–60 characters (letters, numbers, dots, hyphens, underscores only)." },
          { status: 400 }
        );
      }

      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters long." },
          { status: 400 }
        );
      }

      const existingCfg = await getSuperAdminConfig();
      if (existingCfg?.setupCompleted) {
        // One-time setup is already done! Only allow rotation if caller has active superadmin session or valid currentPassword
        const session = getRequestSession(request, false);
        const isAuthedSuper = session?.role === "superadmin";
        const currentMatches =
          currentPassword && verifyPassword(currentPassword, existingCfg.passwordHash);

        if (!isAuthedSuper && !currentMatches) {
          return NextResponse.json(
            {
              error:
                "One-time Superadmin setup has already been completed and is locked. Enter your current password to rotate credentials.",
            },
            { status: 403 }
          );
        }
      }

      const passwordHash = hashPassword(newPassword);
      const saved = await saveSuperAdminConfig({
        username: newUsername,
        passwordHash,
      });

      resetRateLimit(`setup:${ip}`);
      const token = createSessionToken({
        role: "superadmin",
        username: saved.username,
      });
      const res = NextResponse.json({
        success: true,
        token,
        user: { role: "superadmin", username: saved.username },
        message: "Superadmin credentials configured and locked.",
      });
      setSessionCookie(res, token);
      return res;
    }

    const role =
      body.role === "superadmin"
        ? "superadmin"
        : body.role === "ba"
        ? "ba"
        : "supervisor";
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || body.pin || "").trim();
    const campaignId = String(body.campaignId || "golden-morn").trim().toLowerCase();

    // ── 0B. BRAND AMBASSADOR (BA) SIGN-IN (Username + Password only) ──
    if (role === "ba") {
      const storeCode = String(body.storeCode || "").trim().toLowerCase();
      if ((!username && !storeCode) || !password) {
        return NextResponse.json(
          { error: "Username / Staff ID and password are required." },
          { status: 400 }
        );
      }

      const ip = getClientIp(request);
      const baRateKey = `ba_auth:${ip}:${campaignId}:${username || storeCode}`;
      const baRate = checkRateLimit(baRateKey, 10, 15 * 60 * 1000);
      if (!baRate.allowed) {
        return NextResponse.json(
          { error: `Too many failed sign-in attempts. Retry in ${baRate.retryAfterSec}s.` },
          { status: 429 }
        );
      }

      const campaign = await getCampaign(campaignId);
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      }

      const lookupKey = username || storeCode;
      const normLookup = lookupKey.replace(/[^a-z0-9]/g, "");

      const candidates = (campaign.stores || []).filter((s) => {
        const sUser = (s.baUsername || "").trim().toLowerCase();
        const sCode = (s.storeCode || (s as any).code || "").trim().toLowerCase();
        const sId = (s.id || "").trim().toLowerCase();
        if (storeCode && (sCode === storeCode || sId === storeCode)) return true;
        if (sUser && sUser === lookupKey) return true;
        if (sCode === lookupKey || sId === lookupKey) return true;
        if (normLookup && (sCode.replace(/[^a-z0-9]/g, "") === normLookup || sId.replace(/[^a-z0-9]/g, "") === normLookup)) {
          return true;
        }
        return false;
      });

      if (candidates.length === 0) {
        return NextResponse.json(
          { error: "Invalid BA username or password." },
          { status: 401 }
        );
      }

      const store = candidates.find((s) => {
        const effectivePin =
          (s.baPassword && s.baPassword.trim()) ||
          (s.pin && s.pin.trim()) ||
          "1234";
        return verifyPassword(password, effectivePin);
      });

      if (!store) {
        return NextResponse.json(
          { error: "Incorrect BA password or access PIN." },
          { status: 401 }
        );
      }

      if (store.isActive === false || (store as any).active === false) {
        return NextResponse.json(
          { error: "Your assigned location is currently deactivated." },
          { status: 403 }
        );
      }

      resetRateLimit(baRateKey);
      const canonicalStoreCode = store.storeCode || (store as any).code || store.id || lookupKey;
      const baDisplayName = String(store.baName || username || canonicalStoreCode).trim();
      const existingShift = await getStoreTodayCheckIn(
        campaignId,
        canonicalStoreCode,
        getTodayDateStr()
      );
      const activeShift =
        existingShift && existingShift.status !== "checked_out" && existingShift.status !== "rejected"
          ? existingShift
          : null;

      const token = createSessionToken({
        role: "ba",
        username: username || canonicalStoreCode,
        campaignId,
        storeCode: canonicalStoreCode,
        checkInId: activeShift?.id,
        baName: activeShift?.baName || baDisplayName,
      });

      const { pin: _pin, baPassword: _baPass, ...safeStore } = store;

      const res = NextResponse.json({
        success: true,
        token,
        user: {
          role: "ba",
          username: username || canonicalStoreCode,
          campaignId,
          storeCode: canonicalStoreCode,
          storeName: store.name,
          baName: activeShift?.baName || baDisplayName,
          baPhone: store.baPhone || "",
        },
        store: safeStore,
        activeShift,
      });
      setSessionCookie(res, token, BA_SHIFT_COOKIE_NAME);
      return res;
    }

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

    const ip = getClientIp(request);
    const rateKey = `auth:${ip}:${role}:${username}`;
    const rateCheck = checkRateLimit(rateKey, 8, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Too many failed sign-in attempts. Please wait ${rateCheck.retryAfterSec}s before trying again.`,
        },
        { status: 429 }
      );
    }

    // Check Firestore one-time setup credentials first, then env fallback
    const storedSuperCfg = await getSuperAdminConfig();
    const envUser = (process.env.SUPERADMIN_USERNAME || "superadmin").trim().toLowerCase();
    const envPass = (process.env.SUPERADMIN_PASSWORD || "EXP@2026").trim();

    const isStoredSuperMatch = Boolean(
      storedSuperCfg &&
        username === storedSuperCfg.username &&
        verifyPassword(password, storedSuperCfg.passwordHash)
    );
    const isEnvSuperMatch =
      !storedSuperCfg && username === envUser && verifyPassword(password, envPass);

    const isMasterMatch = isStoredSuperMatch || isEnvSuperMatch;

    // ── 1. SUPERADMIN LOGIN ──
    if (role === "superadmin") {
      if (!isMasterMatch) {
        return NextResponse.json(
          { error: "Invalid Superadmin username or password." },
          { status: 401 }
        );
      }

      resetRateLimit(rateKey);
      const token = createSessionToken({ role: "superadmin", username });
      const res = NextResponse.json({
        success: true,
        token,
        user: { role: "superadmin", username },
      });
      setSessionCookie(res, token);
      return res;
    }

    // ── 2. CAMPAIGN SUPERVISOR LOGIN ──
    if (isMasterMatch) {
      resetRateLimit(rateKey);
      const token = createSessionToken({ role: "superadmin", username, campaignId });
      const res = NextResponse.json({
        success: true,
        token,
        user: { role: "superadmin", username, campaignId },
      });
      setSessionCookie(res, token);
      return res;
    }

    const campaign = await getCampaign(campaignId);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found." },
        { status: 404 }
      );
    }

    const expectedUsername = (campaign.adminUsername || "supervisor").trim().toLowerCase();
    const expectedPassword = (campaign.adminPassword || campaign.adminPin || "2026").trim();

    const usernameMatches = username === expectedUsername;
    const passwordMatches = verifyPassword(password, expectedPassword);

    if (!usernameMatches || !passwordMatches) {
      return NextResponse.json(
        { error: "Invalid Supervisor username or password for this campaign." },
        { status: 401 }
      );
    }

    resetRateLimit(rateKey);
    const token = createSessionToken({ role: "supervisor", username, campaignId });
    const res = NextResponse.json({
      success: true,
      token,
      user: { role: "supervisor", username, campaignId },
    });
    setSessionCookie(res, token);
    return res;
  } catch (err: any) {
    console.error("POST /api/auth error:", err);
    return NextResponse.json(
      { error: "Authentication failed due to a server error." },
      { status: 500 }
    );
  }
}
