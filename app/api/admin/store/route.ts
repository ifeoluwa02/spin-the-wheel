import { NextRequest, NextResponse } from "next/server";
import { verifySignedSession } from "@/lib/auth-session";
import { getCampaign, updateCampaign, invalidateCampaignCache } from "@/lib/campaign";
import type { StoreLocation } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Helper to authenticate request.
 * Allows "admin" and "super-admin" roles.
 */
function authenticateAdmin(request: NextRequest, targetCampaignId?: string) {
  const campaignCookie = request.cookies.get("campaign_session")?.value;
  const superAdminCookie = request.cookies.get("super_admin_session")?.value;

  const campaignSession = campaignCookie ? verifySignedSession(campaignCookie) : null;
  const superAdminSession = superAdminCookie ? verifySignedSession(superAdminCookie) : null;

  const session = superAdminSession || campaignSession;
  if (!session) {
    return { error: "Unauthorized. Please log in.", status: 401 };
  }

  if (session.role !== "admin" && session.role !== "super-admin") {
    return { error: "Forbidden. Supervisors cannot edit store accounts.", status: 403 };
  }

  if (session.role === "admin" && targetCampaignId && session.campaignId !== targetCampaignId) {
    return { error: "Forbidden. You cannot manage stores for another campaign.", status: 403 };
  }

  return { session };
}

/**
 * Sanitizes a store code string into a clean lowercase slug.
 */
function sanitizeStoreCode(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * POST /api/admin/store
 * Adds a new store to the campaign.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignId, store } = body;

    if (!campaignId) {
      return NextResponse.json({ error: "Missing campaignId." }, { status: 400 });
    }

    const auth = authenticateAdmin(request, campaignId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!store || !store.name?.trim()) {
      return NextResponse.json({ error: "Store name is required." }, { status: 400 });
    }

    const campaign = await getCampaign(campaignId, true);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const stores = campaign.stores || [];
    const rawCode = store.code?.trim() || store.name.trim();
    const cleanCode = sanitizeStoreCode(rawCode) || `store-${Date.now().toString(36)}`;

    // Check if code is already taken by an existing store
    const codeExists = stores.some((s) => s.code?.toLowerCase() === cleanCode.toLowerCase());
    if (codeExists) {
      return NextResponse.json(
        { error: `Store code "${cleanCode}" is already in use by another store location.` },
        { status: 400 }
      );
    }

    const newStore: StoreLocation = {
      id: `store-${Date.now()}`,
      name: store.name.trim(),
      code: cleanCode,
      city: store.city?.trim() || undefined,
      state: store.state?.trim() || undefined,
      pin: store.pin?.trim() || "1234",
      active: store.active !== false,
      pausedPrizes: Array.isArray(store.pausedPrizes) ? store.pausedPrizes : [],
      customAllocations: store.customAllocations || undefined,
    };

    const updatedStores = [...stores, newStore];
    const updatedCampaign = { ...campaign, stores: updatedStores };

    await updateCampaign(updatedCampaign);
    invalidateCampaignCache(campaignId);

    return NextResponse.json({
      success: true,
      store: newStore,
      stores: updatedStores,
    });
  } catch (err: any) {
    console.error("API POST /api/admin/store error:", err);
    return NextResponse.json({ error: err.message || "Failed to create store." }, { status: 500 });
  }
}

/**
 * PUT /api/admin/store
 * Updates an existing store's details (Name, Code, City, State, PIN, Active status).
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignId, storeId, store } = body;

    if (!campaignId || !storeId) {
      return NextResponse.json({ error: "campaignId and storeId are required." }, { status: 400 });
    }

    const auth = authenticateAdmin(request, campaignId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!store || !store.name?.trim()) {
      return NextResponse.json({ error: "Store name cannot be empty." }, { status: 400 });
    }

    const campaign = await getCampaign(campaignId, true);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const stores = campaign.stores || [];
    const targetIndex = stores.findIndex((s) => s.id === storeId || s.code === storeId);
    if (targetIndex === -1) {
      return NextResponse.json({ error: "Store not found in campaign." }, { status: 404 });
    }

    const currentStore = stores[targetIndex];
    const cleanCode = sanitizeStoreCode(store.code?.trim() || currentStore.code);

    if (!cleanCode) {
      return NextResponse.json({ error: "Store code cannot be empty." }, { status: 400 });
    }

    // Verify code uniqueness against OTHER stores
    const codeConflict = stores.some(
      (s, idx) => idx !== targetIndex && s.code?.toLowerCase() === cleanCode.toLowerCase()
    );
    if (codeConflict) {
      return NextResponse.json(
        { error: `Store code "${cleanCode}" is already taken by another store location.` },
        { status: 400 }
      );
    }

    const updatedStore: StoreLocation = {
      ...currentStore,
      name: store.name.trim(),
      code: cleanCode,
      city: store.city?.trim() || undefined,
      state: store.state?.trim() || undefined,
      pin: store.pin?.trim() || currentStore.pin || "1234",
      active: store.active !== undefined ? Boolean(store.active) : currentStore.active !== false,
      pausedPrizes: Array.isArray(store.pausedPrizes) ? store.pausedPrizes : currentStore.pausedPrizes || [],
      customAllocations: store.customAllocations ?? currentStore.customAllocations,
    };

    const updatedStores = [...stores];
    updatedStores[targetIndex] = updatedStore;

    const updatedCampaign = { ...campaign, stores: updatedStores };
    await updateCampaign(updatedCampaign);
    invalidateCampaignCache(campaignId);

    return NextResponse.json({
      success: true,
      store: updatedStore,
      stores: updatedStores,
    });
  } catch (err: any) {
    console.error("API PUT /api/admin/store error:", err);
    return NextResponse.json({ error: err.message || "Failed to update store." }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/store
 * Quick update for store status (e.g. toggle active).
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignId, storeId, active } = body;

    if (!campaignId || !storeId || active === undefined) {
      return NextResponse.json({ error: "campaignId, storeId, and active are required." }, { status: 400 });
    }

    const auth = authenticateAdmin(request, campaignId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const campaign = await getCampaign(campaignId, true);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const stores = campaign.stores || [];
    const targetIndex = stores.findIndex((s) => s.id === storeId || s.code === storeId);
    if (targetIndex === -1) {
      return NextResponse.json({ error: "Store not found in campaign." }, { status: 404 });
    }

    const updatedStores = [...stores];
    updatedStores[targetIndex] = {
      ...updatedStores[targetIndex],
      active: Boolean(active),
    };

    const updatedCampaign = { ...campaign, stores: updatedStores };
    await updateCampaign(updatedCampaign);
    invalidateCampaignCache(campaignId);

    return NextResponse.json({
      success: true,
      store: updatedStores[targetIndex],
      stores: updatedStores,
    });
  } catch (err: any) {
    console.error("API PATCH /api/admin/store error:", err);
    return NextResponse.json({ error: err.message || "Failed to toggle store status." }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/store
 * Removes a store from the campaign.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignId, storeId } = body;

    if (!campaignId || !storeId) {
      return NextResponse.json({ error: "campaignId and storeId are required." }, { status: 400 });
    }

    const auth = authenticateAdmin(request, campaignId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const campaign = await getCampaign(campaignId, true);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const stores = campaign.stores || [];
    const updatedStores = stores.filter((s) => s.id !== storeId && s.code !== storeId);

    if (updatedStores.length === stores.length) {
      return NextResponse.json({ error: "Store not found." }, { status: 404 });
    }

    const updatedCampaign = { ...campaign, stores: updatedStores };
    await updateCampaign(updatedCampaign);
    invalidateCampaignCache(campaignId);

    return NextResponse.json({
      success: true,
      stores: updatedStores,
    });
  } catch (err: any) {
    console.error("API DELETE /api/admin/store error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete store." }, { status: 500 });
  }
}
