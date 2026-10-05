import { NextRequest, NextResponse } from "next/server";
import { getCampaign } from "@/lib/campaign";
import { createSignedSession, verifyPassword } from "@/lib/auth-session";

export async function POST(request: NextRequest) {
  try {
    const { campaignId, storeCode, pin } = await request.json();

    if (!campaignId || !storeCode || typeof campaignId !== "string" || typeof storeCode !== "string") {
      return NextResponse.json(
        { error: "Campaign ID and Store Code are required." },
        { status: 400 }
      );
    }

    const campaign = await getCampaign(campaignId, true);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found." },
        { status: 404 }
      );
    }

    const cleanCode = String(storeCode).trim().toLowerCase();
    const store = campaign.stores?.find(
      (s) =>
        (s.code && s.code.toLowerCase() === cleanCode) ||
        (s.id && s.id.toLowerCase() === cleanCode)
    );

    if (!store) {
      return NextResponse.json(
        { error: "Store / BA account not found." },
        { status: 404 }
      );
    }

    if (store.active === false) {
      return NextResponse.json(
        { error: "This store / BA account has been paused by the admin." },
        { status: 403 }
      );
    }

    // Verify PIN if store has a dedicated PIN or campaign-wide default PIN
    const effectivePin =
      (store.pin && store.pin.trim()) ||
      (campaign.adminPin && campaign.adminPin.trim()) ||
      "";

    if (effectivePin) {
      const inputPin = String(pin || "").trim();
      if (!verifyPassword(inputPin, effectivePin)) {
        return NextResponse.json(
          { error: "Incorrect PIN. Please try again." },
          { status: 401 }
        );
      }
    }


    // Issue 1-Hour signed BA session token
    const token = createSignedSession(
      {
        role: "ba",
        email: `${store.code}@store.internal`,
        name: store.name,
        campaignId: campaign.id,
        storeCode: store.code,
        storeName: store.name,
      },
      1 // exactly 1 hour
    );

    const expiresAt = Date.now() + 60 * 60 * 1000;

    const response = NextResponse.json({
      success: true,
      store: {
        code: store.code,
        name: store.name,
      },
      token,
      expiresAt,
    });

    response.cookies.set("ba_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60, // 1 hour (3600 seconds)
    });

    return response;
  } catch (err: any) {
    console.error("API /api/auth/ba-login error:", err);
    return NextResponse.json(
      { error: "Authentication failed. Please check network connection." },
      { status: 500 }
    );
  }
}
