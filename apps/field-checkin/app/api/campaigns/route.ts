import { NextRequest, NextResponse } from "next/server";
import {
  getAllCampaigns,
  getCampaign,
  saveCampaign,
  seedDemoStores,
  DEFAULT_DEMO_STORES,
} from "@/lib/repository";
import {
  getRequestSession,
  hashPassword,
  sanitizeCampaignForPublic,
} from "@/lib/auth";
import {
  isValidCoordinates,
  MIN_GEOFENCE_RADIUS_M,
  MAX_GEOFENCE_RADIUS_M,
} from "@/lib/geo";
import type { Campaign, StoreLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns?slug=...
 * - Publicly fetches sanitized campaign metadata by slug (stripping all PINs & passwords).
 * - Full campaign list or unredacted admin metadata requires an authenticated Superadmin/Supervisor session.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const forcePublic = searchParams.get("public") === "1";
    const session = getRequestSession(request, false);

    if (slug) {
      const cleanSlug = slug.trim().toLowerCase();
      const campaign = await getCampaign(cleanSlug);
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      }

      const isAuthorizedAdmin =
        !forcePublic &&
        session &&
        (session.role === "superadmin" ||
          (session.role === "supervisor" &&
            session.campaignId?.toLowerCase() === cleanSlug));

      return NextResponse.json({
        success: true,
        campaign: isAuthorizedAdmin ? campaign : sanitizeCampaignForPublic(campaign),
      });
    }

    // Listing all campaigns requires Superadmin authentication
    if (!session || session.role !== "superadmin") {
      return NextResponse.json(
        { error: "Superadmin authentication required to list all campaigns." },
        { status: 401 }
      );
    }

    const campaigns = await getAllCampaigns();
    return NextResponse.json({ success: true, campaigns });
  } catch (err: any) {
    console.error("GET /api/campaigns error:", err);
    return NextResponse.json(
      { error: "Failed to load campaigns." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns
 * Creates or updates a brand campaign/event. Requires Superadmin or scoped Supervisor authentication.
 */
export async function POST(request: NextRequest) {
  try {
    const session = getRequestSession(request, false);
    if (!session || (session.role !== "superadmin" && session.role !== "supervisor")) {
      return NextResponse.json(
        { error: "Authentication required to modify campaigns." },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Quick action: seed demo stores for a campaign
    if (body.action === "seed_demo_stores") {
      const targetSlug = String(body.campaignId || "golden-morn").trim().toLowerCase();
      if (
        session.role === "supervisor" &&
        session.campaignId?.toLowerCase() !== targetSlug
      ) {
        return NextResponse.json(
          { error: "Forbidden: cannot modify another campaign." },
          { status: 403 }
        );
      }
      const seeded = await seedDemoStores(targetSlug);
      return NextResponse.json({ success: true, stores: seeded });
    }

    const {
      id,
      name,
      brandName,
      activationType,
      adminUsername,
      adminPassword,
      adminPin,
      primaryColor,
      secondaryColor,
      stores,
      seedDefaultStores,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Campaign / Event name is required." },
        { status: 400 }
      );
    }

    const slug = String(id || name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!slug) {
      return NextResponse.json(
        { error: "Valid campaign slug is required." },
        { status: 400 }
      );
    }

    if (
      session.role === "supervisor" &&
      session.campaignId?.toLowerCase() !== slug
    ) {
      return NextResponse.json(
        { error: "Forbidden: supervisors can only update their assigned campaign." },
        { status: 403 }
      );
    }

    const existing = await getCampaign(slug);
    const rawStores: StoreLocation[] = Array.isArray(stores)
      ? stores
      : existing?.stores || (seedDefaultStores ? DEFAULT_DEMO_STORES : []);

    // Validate & normalize stores (coordinates, radius bounds, hashed credentials)
    const validatedStores: StoreLocation[] = [];
    for (const s of rawStores) {
      const lat = Number(s.lat);
      const lng = Number(s.lng);
      if (!isValidCoordinates(lat, lng)) {
        return NextResponse.json(
          {
            error: `Invalid GPS coordinates for venue "${s.name || s.storeCode}". Please provide valid latitude and longitude.`,
          },
          { status: 400 }
        );
      }

      const clampedRadius = Math.min(
        Math.max(Number(s.geofenceRadius) || 200, MIN_GEOFENCE_RADIUS_M),
        MAX_GEOFENCE_RADIUS_M
      );
      const rawPin = String(s.baPassword || s.pin || "1234").trim();
      const hashedPin = hashPassword(rawPin);

      validatedStores.push({
        ...s,
        id: s.id || s.storeCode,
        storeCode: s.storeCode || s.id,
        lat,
        lng,
        geofenceRadius: clampedRadius,
        pin: hashedPin,
        baPassword: hashedPin,
        isActive: s.isActive !== false && s.active !== false,
      });
    }

    const rawAdminPass = String(
      adminPassword || existing?.adminPassword || adminPin || existing?.adminPin || "2026"
    ).trim();
    const hashedAdminPass = hashPassword(rawAdminPass);

    const campaignPayload: Campaign = {
      id: slug,
      name: String(name).trim().slice(0, 150),
      brandName: String(brandName || name).trim().slice(0, 120),
      activationType: activationType === "hospital" ? "hospital" : "retail",
      adminUsername: String(
        adminUsername || existing?.adminUsername || `${slug.split("-")[0]}_admin`
      )
        .trim()
        .toLowerCase(),
      adminPassword: hashedAdminPass,
      adminPin: hashedAdminPass,
      primaryColor: primaryColor || existing?.primaryColor || "#14B8A6",
      secondaryColor: secondaryColor || existing?.secondaryColor || "#F59E0B",
      stores: validatedStores,
      active: true,
      createdAt: existing?.createdAt || Date.now(),
    };

    const saved = await saveCampaign(campaignPayload);
    return NextResponse.json({ success: true, campaign: saved });
  } catch (err: any) {
    console.error("POST /api/campaigns error:", err);
    return NextResponse.json(
      { error: "Failed to save campaign." },
      { status: 500 }
    );
  }
}
