import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifySignedSession, verifyPassword } from "@/lib/auth-session";
import { getCampaign, getSuperAdminConfig, updateCampaign, invalidateCampaignCache } from "@/lib/campaign";
import type { StoreLocation } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Checks if a PIN is trivial (e.g. all repeating digits or ascending/descending sequential)
 */
function isTrivialPin(pin: string): boolean {
  // All identical digits (e.g. 1111, 2222, 0000)
  if (/^(\d)\1+$/.test(pin)) return true;

  // Ascending sequence (e.g. 1234, 2345, 0123)
  if ("0123456789".includes(pin)) return true;

  // Descending sequence (e.g. 4321, 9876, 3210)
  if ("9876543210".includes(pin)) return true;

  return false;
}

/**
 * Generates a cryptographically sound random numeric PIN of specified length
 */
function generateSecurePin(length: number, usedPins: Set<string>): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  let attempts = 0;

  while (attempts < 2000) {
    attempts++;
    const num = crypto.randomInt(min, max + 1);
    const pin = num.toString().padStart(length, "0");
    if (!isTrivialPin(pin) && !usedPins.has(pin)) {
      usedPins.add(pin);
      return pin;
    }
  }

  // Fallback if pool is constrained
  const fallback = crypto.randomInt(min, max + 1).toString().padStart(length, "0");
  usedPins.add(fallback);
  return fallback;
}

export async function POST(request: NextRequest) {
  try {
    const campaignCookie = request.cookies.get("campaign_session")?.value;
    const superAdminCookie = request.cookies.get("super_admin_session")?.value;

    const campaignSession = campaignCookie ? verifySignedSession(campaignCookie) : null;
    const superAdminSession = superAdminCookie ? verifySignedSession(superAdminCookie) : null;

    const session = superAdminSession || campaignSession;
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in.", expired: true },
        { status: 401 }
      );
    }

    if (session.role !== "admin" && session.role !== "super-admin") {
      return NextResponse.json(
        { error: "Forbidden. Only campaign admins can rotate store PINs." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { campaignId, password, scopeState = "all", onlyActive = false, pinLength = 4 } = body;

    if (!campaignId || !password) {
      return NextResponse.json(
        { error: "Campaign ID and Admin Password confirmation are required." },
        { status: 400 }
      );
    }

    if (session.role === "admin" && session.campaignId !== campaignId) {
      return NextResponse.json(
        { error: "Forbidden. Access denied to this campaign." },
        { status: 403 }
      );
    }

    // Verify Master Super Admin password OR Campaign Admin password
    const superCfg = await getSuperAdminConfig();
    const isSuperAdmin = superCfg && verifyPassword(String(password), superCfg.password);

    const campaign = await getCampaign(campaignId, true);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const isCampaignAdmin =
      (campaign.adminPassword && verifyPassword(String(password), campaign.adminPassword)) ||
      campaign.admins?.some((a) => a.password && verifyPassword(String(password), a.password));

    if (!isSuperAdmin && !isCampaignAdmin) {
      return NextResponse.json(
        { error: "Incorrect admin password. Bulk PIN rotation denied." },
        { status: 401 }
      );
    }

    const allStores = campaign.stores || [];
    if (allStores.length === 0) {
      return NextResponse.json(
        { error: "No stores or BA accounts found in this campaign." },
        { status: 400 }
      );
    }

    // Filter target stores based on scope
    const targetStores = allStores.filter((s) => {
      if (scopeState && scopeState !== "all") {
        if (!s.state || s.state.toLowerCase() !== String(scopeState).toLowerCase()) {
          return false;
        }
      }
      if (onlyActive && s.active === false) {
        return false;
      }
      return true;
    });

    if (targetStores.length === 0) {
      return NextResponse.json(
        { error: "No stores match the selected filter criteria." },
        { status: 400 }
      );
    }

    const normalizedLength = Number(pinLength) === 6 ? 6 : 4;
    const usedPins = new Set<string>();
    const now = Date.now();
    const rotatedAtStr = new Date(now).toISOString();
    const rotatedAtReadable = new Date(now).toLocaleString();

    const targetStoreIdSet = new Set(targetStores.map((s) => s.id || s.code));

    const auditList: Array<{
      id: string;
      name: string;
      code: string;
      city?: string;
      state?: string;
      oldPin?: string;
      newPin: string;
      rotatedAt: string;
    }> = [];

    const updatedStores: StoreLocation[] = allStores.map((store) => {
      const storeKey = store.id || store.code;
      if (targetStoreIdSet.has(storeKey)) {
        const oldPin = store.pin || "None";
        const newPin = generateSecurePin(normalizedLength, usedPins);

        auditList.push({
          id: store.id,
          name: store.name,
          code: store.code,
          city: store.city || "—",
          state: store.state || "—",
          oldPin,
          newPin,
          rotatedAt: rotatedAtReadable,
        });

        return {
          ...store,
          pin: newPin,
          hasPin: true,
          pinRotatedAt: now,
        };
      }
      return store;
    });

    // Save updated stores in Firestore
    const updatedCampaign = {
      ...campaign,
      stores: updatedStores,
    };

    await updateCampaign(updatedCampaign);
    invalidateCampaignCache(campaignId);

    // Build standard CSV file content
    const headers = ["Store Code", "Store Name", "State", "City", "New PIN", "Previous PIN", "Rotated At"];
    const csvRows = auditList.map((item) => [
      `"${item.code.replace(/"/g, '""')}"`,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${(item.state || "").replace(/"/g, '""')}"`,
      `"${(item.city || "").replace(/"/g, '""')}"`,
      `"${item.newPin}"`,
      `"${item.oldPin}"`,
      `"${item.rotatedAt}"`,
    ]);

    const csvContent = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\r\n");

    const campaignSlugClean = (campaign.name || "campaign")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");
    const dateStamp = new Date(now).toISOString().slice(0, 10);
    const scopeLabel = scopeState !== "all" ? `_${scopeState.toLowerCase()}` : "";
    const filename = `${campaignSlugClean}_store_pins${scopeLabel}_${dateStamp}.csv`;

    return NextResponse.json({
      success: true,
      rotatedCount: auditList.length,
      stores: auditList,
      csvContent,
      filename,
    });
  } catch (err: any) {
    console.error("API POST /api/admin/rotate-pins error:", err);
    return NextResponse.json(
      { error: "Internal server error during PIN rotation." },
      { status: 500 }
    );
  }
}
