import { NextRequest, NextResponse } from "next/server";
import { getCampaign } from "@/lib/repository";
import {
  verifyPassword,
  createSessionToken,
  getRequestSession,
  setSessionCookie,
  clearSessionCookies,
  checkRateLimit,
  resetRateLimit,
  getClientIp,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth
 * Verifies the active HttpOnly session cookie or Bearer token.
 */
export async function GET(request: NextRequest) {
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
 * DELETE /api/auth
 * Clears session cookies on logout.
 */
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  clearSessionCookies(res);
  return res;
}

/**
 * POST /api/auth
 * Authenticates Superadmin or Campaign Supervisor with rate limiting and HttpOnly cookies.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const role = body.role === "superadmin" ? "superadmin" : "supervisor";
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const campaignId = String(body.campaignId || "golden-morn").trim().toLowerCase();

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

    const masterUser = (process.env.SUPERADMIN_USERNAME || "superadmin").trim().toLowerCase();
    const masterPass = (process.env.SUPERADMIN_PASSWORD || "EXP@2026").trim();

    const isMasterMatch =
      username === masterUser && verifyPassword(password, masterPass);

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

    const usernameMatches =
      username === expectedUsername || username === "supervisor";
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
