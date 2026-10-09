"use client";

import { useEffect, useState } from "react";
import type { Campaign, Participant, Prize, StoreLocation, Supervisor, AdminRole } from "@/types";
import { AGE_RANGES, GENDERS, NIGERIAN_STATES } from "@/types";
import {
  getCampaign,
  updateCampaign,
  getParticipants,
  subscribeCampaign,
  subscribeParticipants,
  getSupervisorStores,
  pausePrizeGlobally,
  unpausePrizeGlobally,
  pausePrizeAtStore,
  unpausePrizeAtStore,
  batchToggleStorePrizes,
  toggleStoreActive,
  getStorePrizeQuota,
  getStorePrizeRemaining,
  invalidateCampaignCache,
  DEFAULT_CAMPAIGN,
} from "@/lib/campaign";
import Link from "next/link";
import {
  Settings, Trophy, Users, BarChart3, Download, QrCode, Tv, Smartphone,
  Plus, Trash2, Lock, LogOut, Sparkles, CheckCircle, Dices,
  ExternalLink, Palette, Save, Activity, Target, Layers,
  ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown, Shield, X, Check, Store, MapPin, UserCheck, Copy, AlertTriangle,
  UsersRound, PauseCircle, PlayCircle, Globe, Building2, Search, SlidersHorizontal,
  Play, Pause, Package, Clock, RefreshCw, Key, FileSpreadsheet, Edit3,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { getGradientContrastColor, isLightColor } from "@/lib/colors";
import { getRemainingStock } from "@/lib/pickPrize";
import TeamTab from "@/components/TeamTab";

type Tab = "analytics" | "branding" | "prizes" | "stores" | "export" | "luckydraw" | "team";

/**
 * Robust matcher checking if a participant belongs to a given store.
 * Handles:
 * - Direct code match (case-insensitive & trimmed)
 * - Normalized alphanumeric slug match (e.g. "ikeja-mall", "ikeja_mall", "ikeja mall")
/**
 * Branch-Specific Store Attribution Matcher:
 * - If the participant record has a storeCode, we MUST match only against the branch
 *   storeCode or store ID. We NEVER fall back to comparing generic supermarket names
 *   (e.g. "Jendol", "Justrite", "Spar") because chains have dozens of physical branches
 *   sharing the exact same chain name.
 * - Uses exact string equality followed by alphanumeric normalization to safely handle
 *   trailing hyphens or slug variances (e.g. "jendol-ijede-ikorodu-").
 * - Fallback: only if participant has NO storeCode at all, match by unique store name,
 *   excluding generic non-store values like "General Stage" or "Kiosk".
 */
function isParticipantInStore(p: Participant, s: StoreLocation): boolean {
  if (!p || !s) return false;

  const normalize = (v?: string) => (v ? v.trim().toLowerCase().replace(/[^a-z0-9]/g, "") : "");

  const pCode = (p.storeCode || "").trim().toLowerCase();
  const sCode = (s.code || "").trim().toLowerCase();
  const sId = (s.id || "").trim().toLowerCase();

  // 1. If participant has a storeCode, strictly match storeCode or storeId
  if (pCode) {
    if (sCode && pCode === sCode) return true;
    if (sId && pCode === sId) return true;

    const normPCode = normalize(pCode);
    const normSCode = normalize(sCode);
    const normId = normalize(sId);

    if (normSCode && normPCode === normSCode) return true;
    if (normId && normPCode === normId) return true;

    return false;
  }

  // 2. Fallback only when participant has NO storeCode at all
  const pName = (p.storeName || "").trim().toLowerCase();
  if (!pName || pName === "general stage" || pName === "kiosk" || pName === "web") return false;

  const sName = (s.name || "").trim().toLowerCase();
  if (pName === sName) return true;

  const normPName = normalize(pName);
  const normSName = normalize(sName);
  if (normPName && normSName && normPName === normSName) return true;

  return false;
}


/**
 * Robust winner detector.
 * Handles boolean true, string "true", string "Winner", and falls back to prize definition if p.won is absent.
 */
function isParticipantWinner(p: Participant, prizes: Prize[] = []): boolean {
  const rawWon: any = p.won;
  if (rawWon === true || rawWon === "true" || rawWon === "Winner" || rawWon === 1) return true;
  if (rawWon === false || rawWon === "false" || rawWon === "Non-Winner" || rawWon === 0) return false;

  // Fallback to prize lookup if p.won was omitted in legacy records
  if (p.prizeId && prizes.length) {
    const matchedPrize = prizes.find(pr => pr.id === p.prizeId);
    if (matchedPrize) return !matchedPrize.isLosing;
  }
  if (p.prizeLabel) {
    const lbl = p.prizeLabel.toLowerCase();
    if (lbl.includes("try again") || lbl.includes("no prize") || lbl.includes("better luck")) {
      return false;
    }
    return true;
  }
  return false;
}

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole>("admin");
  const [activeSupervisor, setActiveSupervisor] = useState<Supervisor | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [campaign, setCampaign] = useState<Campaign>(DEFAULT_CAMPAIGN);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("analytics");
  const [showQrModal, setShowQrModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearPasswordInput, setClearPasswordInput] = useState("");
  const [clearError, setClearError] = useState("");

  // Bulk Store PIN Rotation state
  const [showRotatePinsModal, setShowRotatePinsModal] = useState(false);
  const [rotateScopeState, setRotateScopeState] = useState<string>("all");
  const [rotateOnlyActive, setRotateOnlyActive] = useState<boolean>(false);
  const [rotatePinLength, setRotatePinLength] = useState<number>(4);
  const [rotatePasswordInput, setRotatePasswordInput] = useState<string>("");
  const [rotateLoading, setRotateLoading] = useState<boolean>(false);
  const [rotateError, setRotateError] = useState<string>("");
  const [copiedPinStoreId, setCopiedPinStoreId] = useState<string | null>(null);
  const [rotatedResult, setRotatedResult] = useState<{
    rotatedCount: number;
    stores: Array<{
      id: string;
      name: string;
      code: string;
      city?: string;
      state?: string;
      oldPin?: string;
      newPin: string;
      rotatedAt: string;
    }>;
    csvContent: string;
    filename: string;
  } | null>(null);

  const [qrUrl, setQrUrl] = useState("");
  const [campaignSlug, setCampaignSlug] = useState("");
  const [luckyWinner, setLuckyWinner] = useState<Participant | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState("all");
  const [customFrom, setCustomFrom] = useState(""); // YYYY-MM-DD
  const [customTo, setCustomTo] = useState("");     // YYYY-MM-DD
  const [pauseLoading, setPauseLoading] = useState<string | null>(null); // prizeId being toggled

  // Per-store prize pause state — store ID stored in state, object derived from campaign.stores
  const [selectedStoreIdForPrizes, setSelectedStoreIdForPrizes] = useState<string | null>(null);
  const selectedStoreForPrizes = selectedStoreIdForPrizes
    ? (campaign.stores || []).find(
      (s) => s.id === selectedStoreIdForPrizes || s.code === selectedStoreIdForPrizes
    ) || null
    : null;
  const setSelectedStoreForPrizes = (store: StoreLocation | null) => setSelectedStoreIdForPrizes(store ? store.id : null);

  const [storePrizeSearch, setStorePrizeSearch] = useState("");
  const [storePrizeStateFilter, setStorePrizeStateFilter] = useState("all");
  const [storePrizeStatusFilter, setStorePrizeStatusFilter] = useState<"all" | "paused" | "active">("all");
  const [expandedStores, setExpandedStores] = useState<Record<string, boolean>>({});

  // Stores tab filter state
  const [storeTabSearch, setStoreTabSearch] = useState("");
  const [storeTabStateFilter, setStoreTabStateFilter] = useState("all");
  const [storeTabStatusFilter, setStoreTabStatusFilter] = useState<"all" | "paused" | "active">("all");

  // Store management state
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreCode, setNewStoreCode] = useState("");
  const [newStoreCity, setNewStoreCity] = useState("");
  const [newStoreState, setNewStoreState] = useState("");
  const [newStorePin, setNewStorePin] = useState("1234");
  const [selectedStoreForQr, setSelectedStoreForQr] = useState<StoreLocation | null>(null);
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeToast, setStoreToast] = useState<string | null>(null);
  const [storeToggleLoading, setStoreToggleLoading] = useState<string | null>(null); // storeId being toggled

  // Edit Store modal state
  const [editingStore, setEditingStore] = useState<StoreLocation | null>(null);
  const [editStoreName, setEditStoreName] = useState("");
  const [editStoreCode, setEditStoreCode] = useState("");
  const [editStoreCity, setEditStoreCity] = useState("");
  const [editStoreState, setEditStoreState] = useState("");
  const [editStorePin, setEditStorePin] = useState("1234");
  const [editStoreActive, setEditStoreActive] = useState(true);
  const [editStoreSaving, setEditStoreSaving] = useState(false);
  const [editStoreError, setEditStoreError] = useState("");

  function handleOpenEditStore(store: StoreLocation) {
    setEditingStore(store);
    setEditStoreName(store.name || "");
    setEditStoreCode(store.code || "");
    setEditStoreCity(store.city || "");
    setEditStoreState(store.state || "");
    setEditStorePin(store.pin || "1234");
    setEditStoreActive(store.active !== false);
    setEditStoreError("");
  }

  function handleCloseEditStore() {
    if (!editStoreSaving) {
      setEditingStore(null);
      setEditStoreError("");
    }
  }

  async function handleSaveEditedStore(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStore || !editStoreName.trim()) return;
    setEditStoreSaving(true);
    setEditStoreError("");

    try {
      const res = await fetch("/api/admin/store", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          storeId: editingStore.id,
          store: {
            name: editStoreName.trim(),
            code: editStoreCode.trim() || undefined,
            city: editStoreCity.trim() || undefined,
            state: editStoreState.trim() || undefined,
            pin: editStorePin.trim() || undefined,
            active: editStoreActive,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setEditStoreError(data.error || "Failed to update store details.");
        setEditStoreSaving(false);
        return;
      }

      // Update local campaign stores with response from server
      setCampaign((prev) => ({
        ...prev,
        stores: data.stores || (prev.stores || []).map((s) => (s.id === editingStore.id ? data.store : s)),
      }));

      setStoreToast(`✅ Store "${data.store.name}" updated successfully!`);
      setTimeout(() => setStoreToast(null), 3500);
      setEditingStore(null);
    } catch (err) {
      console.error("Failed to save edited store:", err);
      setEditStoreError("Network error. Could not reach server.");
    } finally {
      setEditStoreSaving(false);
    }
  }

  async function persistCampaign(updatedCampaign: Campaign) {
    try {
      const res = await fetch("/api/admin/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign: updatedCampaign }),
      });
      if (!res.ok) {
        await updateCampaign(updatedCampaign);
      }
    } catch {
      await updateCampaign(updatedCampaign);
    }
    invalidateCampaignCache(updatedCampaign.id);
  }

  async function handleAddStore(e: React.FormEvent) {
    e.preventDefault();
    if (!newStoreName.trim()) return;
    setStoreSaving(true);

    try {
      const res = await fetch("/api/admin/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          store: {
            name: newStoreName.trim(),
            code: newStoreCode.trim() || undefined,
            city: newStoreCity.trim() || undefined,
            state: newStoreState.trim() || undefined,
            pin: newStorePin.trim() || "1234",
            active: true,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to add store.");
        setStoreSaving(false);
        return;
      }

      setCampaign((prev) => ({
        ...prev,
        stores: data.stores || [...(prev.stores || []), data.store],
      }));

      setNewStoreName("");
      setNewStoreCode("");
      setNewStoreCity("");
      setNewStoreState("");
      setNewStorePin("1234");
      setStoreToast(`✅ "${data.store.name}" added and saved live!`);
      setTimeout(() => setStoreToast(null), 3000);
    } catch (err) {
      console.error("Failed to add store:", err);
      alert("❌ Could not save store. Please check connection.");
    } finally {
      setStoreSaving(false);
    }
  }

  async function handleToggleStoreActive(store: StoreLocation, makeActive: boolean) {
    setStoreToggleLoading(store.id);
    try {
      const res = await fetch("/api/admin/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          storeId: store.id,
          active: makeActive,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setStoreToast(`❌ ${data.error || "Failed to update store status."}`);
        setTimeout(() => setStoreToast(null), 3000);
        return;
      }

      setCampaign((prev) => ({
        ...prev,
        stores: data.stores || (prev.stores || []).map((s) => (s.id === store.id ? { ...s, active: makeActive } : s)),
      }));

      setStoreToast(
        makeActive
          ? `✅ "${store.name}" is now ACTIVE — spins allowed.`
          : `⏸️ "${store.name}" is now INACTIVE — spins blocked.`
      );
      setTimeout(() => setStoreToast(null), 3000);
    } catch (err) {
      console.error("Failed to toggle store active state:", err);
      setStoreToast("❌ Failed to update store status. Please try again.");
      setTimeout(() => setStoreToast(null), 3000);
    } finally {
      setStoreToggleLoading(null);
    }
  }

  async function handleDeleteStore(storeId: string) {
    const target = (campaign.stores || []).find((s) => s.id === storeId || s.code === storeId);
    if (!window.confirm(`Delete store / BA account "${target?.name || storeId}"?`)) return;

    try {
      const res = await fetch("/api/admin/store", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          storeId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to delete store.");
        return;
      }

      setCampaign((prev) => ({
        ...prev,
        stores: data.stores || (prev.stores || []).filter((s) => s.id !== storeId && s.code !== storeId),
      }));

      setStoreToast("🗑️ Store account removed.");
      setTimeout(() => setStoreToast(null), 3000);
    } catch (err) {
      console.error("Failed to delete store:", err);
      alert("❌ Could not delete store. Please check connection.");
    }
  }

  async function handleToggleStorePrize(store: StoreLocation, prize: Prize, pause: boolean) {
    const key = `${store.id}-${prize.id}`;
    setPauseLoading(key);
    try {
      if (!pause) {
        await unpausePrizeAtStore(campaign.id, store.id, prize.id);
        const updatedStores = (campaign.stores || []).map(s =>
          (s.id === store.id || s.code === store.code)
            ? { ...s, pausedPrizes: (s.pausedPrizes || []).filter(id => id !== prize.id) }
            : s
        );
        setCampaign(prev => ({ ...prev, stores: updatedStores }));
        setStoreToast(`▶️ Resumed "${prize.label}" at ${store.name}`);
      } else {
        await pausePrizeAtStore(campaign.id, store.id, prize.id);
        const updatedStores = (campaign.stores || []).map(s =>
          (s.id === store.id || s.code === store.code)
            ? { ...s, pausedPrizes: [...(s.pausedPrizes || []), prize.id] }
            : s
        );
        setCampaign(prev => ({ ...prev, stores: updatedStores }));
        setStoreToast(`⏸️ Paused "${prize.label}" at ${store.name}`);
      }
      setTimeout(() => setStoreToast(null), 3000);
    } catch (err) {
      console.error("Failed to toggle store prize:", err);
      setStoreToast("❌ Failed to update prize status. Please try again.");
      setTimeout(() => setStoreToast(null), 3000);
    } finally {
      setPauseLoading(null);
    }
  }

  async function handleBatchToggleStorePrizes(store: StoreLocation, pauseAll: boolean) {
    const key = `batch-${store.id}`;
    setPauseLoading(key);
    try {
      await batchToggleStorePrizes(campaign.id, store.id, pauseAll);
      const winningPrizes = campaign.prizes.filter(p => !p.isLosing && !p.globallyPaused);
      const allPrizeIds = winningPrizes.map(p => p.id);
      const updatedStores = (campaign.stores || []).map(s =>
        (s.id === store.id || s.code === store.code)
          ? { ...s, pausedPrizes: pauseAll ? allPrizeIds : [] }
          : s
      );
      setCampaign(prev => ({ ...prev, stores: updatedStores }));
      setStoreToast(pauseAll ? `⏸️ Paused all winning prizes at ${store.name}` : `▶️ Resumed all prizes at ${store.name}`);
      setTimeout(() => setStoreToast(null), 3000);
    } catch (err) {
      console.error("Failed to batch toggle store prizes:", err);
      setStoreToast("❌ Failed to batch update. Please try again.");
      setTimeout(() => setStoreToast(null), 3000);
    } finally {
      setPauseLoading(null);
    }
  }

  function toggleStoreExpanded(storeId: string) {
    setExpandedStores(prev => {
      // If not yet explicitly set, clicking will toggle from its current default (which is true if search is active, else false)
      const current = prev[storeId] ?? (storePrizeSearch.trim().length > 0);
      return {
        ...prev,
        [storeId]: !current,
      };
    });
  }

  function handleSetAllExpanded(expand: boolean) {
    const next: Record<string, boolean> = {};
    storesToDisplay.forEach(s => {
      next[s.id] = expand;
    });
    setExpandedStores(next);
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const slug = params.get("c") || process.env.NEXT_PUBLIC_CAMPAIGN_ID || "";
      setCampaignSlug(slug);
      setQrUrl(`${window.location.origin}/?c=${slug}`);
      // Verify signed server session (1-hour JWT token)
      fetch("/api/auth/session")
        .then((res) => res.json())
        .then((data) => {
          if (data.campaignSession && data.campaignSession.campaignId === slug) {
            setAuthenticated(true);
            setAdminRole(data.campaignSession.role);
            if (data.expiresAt) {
              setSessionExpiresAt(data.expiresAt);
            }
            if (data.campaignSession.role === "supervisor") {
              setActiveSupervisor({
                id: data.campaignSession.supervisorId || "",
                name: data.campaignSession.name || "",
                email: data.campaignSession.email || "",
                scopeType: data.campaignSession.scopeType || "state",
                state: data.campaignSession.state,
                storeIds: data.campaignSession.storeIds,
              });
            }
          } else {
            // Session expired on server or not authenticated
            setAuthenticated(false);
            setAdminRole("admin");
            setActiveSupervisor(null);
            setSessionExpiresAt(null);
            sessionStorage.removeItem("admin_authed");
            sessionStorage.removeItem("admin_data");
            sessionStorage.removeItem("supervisor_authed");
            sessionStorage.removeItem("supervisor_data");
            if (data.expired) {
              setLoginError("⚠️ Your session expired after 1 hour. Please log in again to continue.");
            }
          }
        })
        .catch(() => {
          setAuthenticated(false);
        });
    }
  }, []);

  // Live timer tick for remaining session countdown
  useEffect(() => {
    if (!authenticated || !sessionExpiresAt) return;
    const tick = setInterval(() => setCurrentTimeMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [authenticated, sessionExpiresAt]);

  // Session monitor: checks /api/auth/session every 30s and on tab focus, logs out on 1-hour expiry
  useEffect(() => {
    if (!authenticated || !campaignSlug) return;

    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        if (!data.authenticated || (data.campaignSession && data.campaignSession.campaignId !== campaignSlug)) {
          // Token expired after 1 hour!
          setAuthenticated(false);
          setAdminRole("admin");
          setActiveSupervisor(null);
          setSessionExpiresAt(null);
          sessionStorage.removeItem("admin_authed");
          sessionStorage.removeItem("admin_data");
          sessionStorage.removeItem("supervisor_authed");
          sessionStorage.removeItem("supervisor_data");
          setLoginError("⚠️ Your session expired after 1 hour. Please log in again to continue.");
        } else if (data.expiresAt) {
          setSessionExpiresAt(data.expiresAt);
        }
      } catch {
        // network glitch, do not log out on transient disconnect
      }
    };

    const interval = setInterval(checkSession, 20000);
    const onFocus = () => { checkSession(); };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [authenticated, campaignSlug]);

  async function handleRefreshToken() {
    setRefreshingToken(true);
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success && data.expiresAt) {
        setSessionExpiresAt(data.expiresAt);
        setStoreToast("✅ Session token refreshed for another 1 hour.");
        setTimeout(() => setStoreToast(null), 3000);
      } else {
        handleLogout();
        setLoginError("⚠️ Your session expired after 1 hour. Please log in again.");
      }
    } catch {
      setStoreToast("❌ Failed to refresh token. Check network.");
      setTimeout(() => setStoreToast(null), 3000);
    } finally {
      setRefreshingToken(false);
    }
  }

  const [clearing, setClearing] = useState(false);

  // Fetch campaign configuration immediately — used only before auth to display name
  useEffect(() => {
    if (!campaignSlug) return;
    getCampaign(campaignSlug).then((c) => {
      if (c) setCampaign(c);
    });
  }, [campaignSlug]);

  // Live real-time campaign & participant listener once authenticated
  useEffect(() => {
    if (!authenticated || !campaignSlug) return;

    setLoading(true);
    // Initial fetch via secure server API route
    fetch(`/api/admin/participants?c=${campaignSlug}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.participants)) {
          setParticipants(data.participants);
        }
        setLoading(false);
      })
      .catch(() => { });

    const unsubCampaign = subscribeCampaign(campaignSlug, (c) => setCampaign(c));
    const unsubParticipants = subscribeParticipants(campaignSlug, (p) => {
      setParticipants(p);
      setLoading(false);
    });

    return () => {
      unsubCampaign();
      unsubParticipants();
    };
  }, [authenticated, campaignSlug]);

  function handleOpenClearModal() {
    setClearPasswordInput("");
    setClearError("");
    setShowClearModal(true);
  }

  async function handleConfirmClearDatabase(e: React.FormEvent) {
    e.preventDefault();
    setClearError("");
    setClearing(true);
    try {
      const res = await fetch("/api/admin/clear-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaignSlug,
          password: clearPasswordInput,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setClearError(data.error || "Incorrect admin password. Database reset denied.");
        setClearing(false);
        return;
      }

      setParticipants([]);
      setShowClearModal(false);
      setClearPasswordInput("");
      alert(`✅ Database cleared! Deleted ${data.deletedCount} participant record(s) and reset prize claimed stock counts in Firestore.`);
    } catch (err) {
      setClearError("Failed to clear database. Check network connection.");
    } finally {
      setClearing(false);
    }
  }

  function handleOpenRotatePinsModal() {
    setRotateScopeState("all");
    setRotateOnlyActive(false);
    setRotatePinLength(4);
    setRotatePasswordInput("");
    setRotateError("");
    setRotatedResult(null);
    setShowRotatePinsModal(true);
  }

  function handleDownloadRotatedCsv(csvContent?: string, filename?: string) {
    const content = csvContent || rotatedResult?.csvContent;
    const name = filename || rotatedResult?.filename || "store_pins.csv";
    if (!content) return;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleConfirmRotatePins(e: React.FormEvent) {
    e.preventDefault();
    if (!rotatePasswordInput.trim()) {
      setRotateError("Please enter your admin password to authorize PIN rotation.");
      return;
    }
    setRotateLoading(true);
    setRotateError("");

    try {
      const res = await fetch("/api/admin/rotate-pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaignSlug,
          password: rotatePasswordInput,
          scopeState: rotateScopeState,
          onlyActive: rotateOnlyActive,
          pinLength: rotatePinLength,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setRotateError(data.error || "Failed to rotate store PINs.");
        setRotateLoading(false);
        return;
      }

      setRotatedResult(data);
      // Auto-trigger CSV download
      handleDownloadRotatedCsv(data.csvContent, data.filename);

      // Immediately update local campaign.stores state
      if (Array.isArray(data.stores) && campaign.stores) {
        const pinMap = new Map<string, string>(
          data.stores.map((s: { id?: string; code?: string; newPin: string }) => [
            s.id || s.code || "",
            String(s.newPin),
          ])
        );
        const updatedStores: StoreLocation[] = campaign.stores.map((st): StoreLocation => {
          const newPin = pinMap.get(st.id) || pinMap.get(st.code);
          return newPin ? { ...st, pin: newPin, hasPin: true, pinRotatedAt: Date.now() } : st;
        });
        setCampaign({ ...campaign, stores: updatedStores });
      }
    } catch (err) {
      setRotateError("Network error while rotating PINs. Please try again.");
    } finally {
      setRotateLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaignSlug,
          email: emailInput,
          password: passwordInput,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoginError(data.error || "Incorrect email or password.");
        return;
      }

      const c = await getCampaign(campaignSlug, true);
      if (c) setCampaign(c);

      setAuthenticated(true);
      if (data.expiresAt) {
        setSessionExpiresAt(data.expiresAt);
      }
      if (data.user.role === "admin") {
        setAdminRole("admin");
        sessionStorage.setItem("admin_authed", "true");
        sessionStorage.setItem("admin_data", JSON.stringify(data.user));
        sessionStorage.removeItem("supervisor_authed");
        sessionStorage.removeItem("supervisor_data");
      } else {
        setAdminRole("supervisor");
        setActiveSupervisor(data.user);
        sessionStorage.setItem("supervisor_authed", "true");
        sessionStorage.setItem("supervisor_data", JSON.stringify(data.user));
        sessionStorage.removeItem("admin_authed");
        sessionStorage.removeItem("admin_data");
      }
    } catch {
      setLoginError("Login failed. Check your network connection.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch { }
    setAuthenticated(false);
    setAdminRole("admin");
    setActiveSupervisor(null);
    setSessionExpiresAt(null);
    sessionStorage.removeItem("admin_authed");
    sessionStorage.removeItem("admin_data");
    sessionStorage.removeItem("supervisor_authed");
    sessionStorage.removeItem("supervisor_data");
  }

  async function handleSave() {
    setSaving(true);
    await persistCampaign(campaign);
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  function handleAddPrize() {
    const p: Prize = { id: `prize-${Date.now()}`, label: "New Prize", color: "#00BFA6", weight: 10, isLosing: false };
    setCampaign(prev => ({ ...prev, prizes: [...prev.prizes, p] }));
  }

  function handleUpdatePrize(idx: number, field: keyof Prize, value: any) {
    setCampaign(prev => {
      const arr = [...prev.prizes];
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...prev, prizes: arr };
    });
  }

  function handleDeletePrize(idx: number) {
    setCampaign(prev => ({ ...prev, prizes: prev.prizes.filter((_, i) => i !== idx) }));
  }

  function exportToCSV() {
    // Export only what is currently visible (date range + store + search applied)
    const exportRows = storeFiltered;
    const headers = ["Name", "Phone", "Age Range", "Gender", "Email", "Prize Won", "Voucher Code", "Status", "Store / BA Name", "Store Code", "Date & Time"];
    const rows = exportRows.map(p => [
      `"${p.name}"`,
      `"${p.phone}"`,
      `"${p.ageRange || "—"}"`,
      `"${p.gender || "—"}"`,
      `"${p.email || ""}"`,
      `"${p.prizeLabel}"`,
      `"${p.voucherCode || ""}"`,
      p.won ? "Winner" : "Non-Winner",
      `"${p.storeName || "General Stage"}"`,
      `"${p.storeCode || ""}"`,
      `"${new Date(p.createdAt).toLocaleString()}"`,
    ]);
    // Build a descriptive filename that includes the date range
    const rangeLabel =
      dateRangeFilter === "custom" && customFrom && customTo
        ? `${customFrom}_to_${customTo}`
        : dateRangeFilter !== "all"
          ? dateRangeFilter
          : "all_time";
    const storeLabel =
      storeFilter !== "all"
        ? `_${storeFilter}`
        : "";
    const filename = `${campaign.name.toLowerCase().replace(/\s+/g, "_")}_${rangeLabel}${storeLabel}.csv`;
    const csv = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function triggerLuckyDraw() {
    const winners = participants.filter(p => p.won);
    if (!winners.length) return;
    setIsDrawing(true);
    let count = 0;
    const interval = setInterval(() => {
      setLuckyWinner(winners[Math.floor(Math.random() * winners.length)]);
      if (++count > 20) { clearInterval(interval); setIsDrawing(false); }
    }, 100);
  }

  const totalWeight = campaign.prizes.reduce((s, p) => s + Math.max(p.weight, 0), 0);
  const totalParticipants = participants.length;
  const winnersCount = participants.filter(p => p.won).length;
  const winRate = totalParticipants ? Math.round((winnersCount / totalParticipants) * 100) : 0;

  // ─── Date Range Filter ──────────────────────────────────────────────────────
  function getDateRangeCutoff(range: string): number {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    switch (range) {
      case "today": return todayMidnight;
      case "2days": return todayMidnight - 1 * 24 * 60 * 60 * 1000;
      case "week": return todayMidnight - 6 * 24 * 60 * 60 * 1000;
      case "month": return todayMidnight - 29 * 24 * 60 * 60 * 1000;
      case "3months": return todayMidnight - 89 * 24 * 60 * 60 * 1000;
      case "custom": return customFrom ? new Date(customFrom + "T00:00:00").getTime() : 0;
      default: return 0;
    }
  }

  const DATE_RANGE_OPTIONS = [
    { key: "all", label: "All Time" },
    { key: "today", label: "Today" },
    { key: "2days", label: "Last 2 Days" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "3months", label: "Last 3 Months" },
    { key: "custom", label: "Custom Range" },
  ];

  const cutoff = getDateRangeCutoff(dateRangeFilter);
  // For custom range: apply both a floor (from) and a ceiling (to end of that day)
  const customToCeiling = dateRangeFilter === "custom" && customTo
    ? new Date(customTo + "T23:59:59").getTime()
    : Infinity;

  const dateFiltered = cutoff > 0
    ? participants.filter(p => {
      const ts = p.createdAt || 0;
      return ts >= cutoff && ts <= customToCeiling;
    })
    : participants;

  const filtered = dateFiltered.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.phone.includes(searchQuery) ||
    p.prizeLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.storeName && p.storeName.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.storeCode && p.storeCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.voucherCode && p.voucherCode.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedStoreForFilter = storeFilter !== "all"
    ? (campaign.stores || []).find(s => s.code === storeFilter || s.id === storeFilter)
    : null;
  const storeFiltered = selectedStoreForFilter
    ? filtered.filter(p => isParticipantInStore(p, selectedStoreForFilter))
    : (storeFilter === "all" ? filtered : filtered.filter(p => p.storeCode === storeFilter));

  // ─── LOGIN SCREEN ───────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{
        background: "radial-gradient(ellipse at 30% 20%, rgba(255,107,53,0.18) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(0,191,166,0.18) 0%, transparent 50%), #0A1628",
        fontFamily: "Nunito, sans-serif",
      }}>
        <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "#FF6B35" }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "#00BFA6" }} />

        <form onSubmit={handleLogin} className="relative w-full max-w-md">
          <div className="rounded-3xl p-8 space-y-6" style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl" style={{ background: "linear-gradient(135deg, #FF6B35, #00BFA6)" }}>
                  <Shield className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{ background: "#00BFA6", borderColor: "#0A1628" }}>
                  <Lock className="w-3 h-3 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>Admin Portal</h1>
                <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>Sign in with your campaign admin credentials.</p>
              </div>
            </div>

            {!campaignSlug && (
              <div className="rounded-xl px-4 py-3 text-xs font-semibold text-amber-400" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
                ⚠️ No campaign selected. Add <code className="font-mono">?c=your-campaign-id</code> to the URL.
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Admin Email</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => { setEmailInput(e.target.value); setLoginError(""); }}
                  placeholder="admin@brand.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: loginError ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(255,255,255,0.1)",
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={passwordInput}
                    onChange={e => { setPasswordInput(e.target.value); setLoginError(""); }}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full rounded-xl px-4 py-3 pr-12 text-sm text-white outline-none transition-all"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: loginError ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(255,255,255,0.1)",
                    }}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold transition-colors"
                    style={{ color: "rgba(255,255,255,0.35)" }}>
                    {showPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>
              </div>
              {loginError && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                  <X className="w-3.5 h-3.5" /> {loginError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loginLoading || !campaignSlug}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 group transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #00BFA6, #0D9488)",
                boxShadow: "0 8px 24px rgba(0,191,166,0.35)",
                fontFamily: "Rubik, sans-serif",
              }}
            >
              {loginLoading ? "Verifying..." : <>Unlock Dashboard <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>}
            </button>

            <div className="flex items-center justify-center gap-4 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
              <Link href="/" className="hover:text-white transition-colors">← Back to Wheel</Link>
              <span className="opacity-30">·</span>
              <Link href="/super-admin" className="hover:text-white transition-colors">Super Admin →</Link>
            </div>
          </div>
        </form>
      </div>
    );
  }

  const isSupervisor = adminRole === "supervisor";

  // Stores that this supervisor can access
  const supervisorStores = activeSupervisor
    ? getSupervisorStores(campaign, activeSupervisor)
    : (campaign.stores || []);

  const storesToDisplay = isSupervisor ? supervisorStores : (campaign.stores || []);
  const filteredStorePrizes = storesToDisplay.filter(store => {
    const q = storePrizeSearch.toLowerCase().trim();
    const matchesSearch = !q || (
      store.name.toLowerCase().includes(q) ||
      (store.code && store.code.toLowerCase().includes(q)) ||
      (store.city && store.city.toLowerCase().includes(q)) ||
      (store.state && store.state.toLowerCase().includes(q)) ||
      campaign.prizes.some(p => p.label.toLowerCase().includes(q))
    );
    const matchesState = storePrizeStateFilter === "all" || store.state?.toLowerCase() === storePrizeStateFilter.toLowerCase();
    const pausedCount = (store.pausedPrizes || []).length;
    const matchesStatus =
      storePrizeStatusFilter === "all" ? true :
        storePrizeStatusFilter === "paused" ? pausedCount > 0 :
          pausedCount === 0;
    return matchesSearch && matchesState && matchesStatus;
  });

  const storesWithPausedCount = storesToDisplay.filter(s => (s.pausedPrizes || []).length > 0).length;
  const allFilteredExpanded = filteredStorePrizes.length > 0 && filteredStorePrizes.every(s => expandedStores[s.id] ?? (storePrizeSearch.trim().length > 0));

  // Filter calculation for Stores & BAs Tab (scoped to supervisor assigned stores if supervisor)
  const allCampaignStores = storesToDisplay;
  const activeStoresCount = allCampaignStores.filter(s => s.active !== false).length;
  const inactiveStoresCount = allCampaignStores.filter(s => s.active === false).length;

  const filteredStoresTab = allCampaignStores.filter(store => {
    const q = storeTabSearch.toLowerCase().trim();
    const matchesSearch = !q || (
      store.name.toLowerCase().includes(q) ||
      (store.code && store.code.toLowerCase().includes(q)) ||
      (store.city && store.city.toLowerCase().includes(q)) ||
      (store.state && store.state.toLowerCase().includes(q)) ||
      (store.pin && store.pin.toLowerCase().includes(q))
    );
    const matchesState = storeTabStateFilter === "all" || store.state?.toLowerCase() === storeTabStateFilter.toLowerCase();
    const isStoreActive = store.active !== false;
    const matchesStatus =
      storeTabStatusFilter === "all" ? true :
        storeTabStatusFilter === "paused" ? !isStoreActive :
          isStoreActive;
    return matchesSearch && matchesState && matchesStatus;
  });

  const allTabs: { id: Tab; label: string; icon: any; adminOnly?: boolean }[] = [
    { id: "analytics", label: "Analytics", icon: Activity },
    { id: "prizes", label: "Prizes & Stock", icon: Trophy },
    { id: "branding", label: "Brand & Theme", icon: Palette, adminOnly: true },
    { id: "stores", label: "Stores & BAs", icon: Store, adminOnly: true },
    { id: "team", label: "Team", icon: UsersRound, adminOnly: true },
    { id: "export", label: "Participants", icon: Users },
    { id: "luckydraw", label: "Lucky Draw", icon: Sparkles, adminOnly: true },
  ];
  const tabs = allTabs.filter((t) => !t.adminOnly || !isSupervisor);


  // ─── DASHBOARD ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-20" style={{ background: "#070d14", fontFamily: "Nunito, sans-serif" }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 px-4 sm:px-6 py-3" style={{
        background: "rgba(7,13,20,0.9)", backdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background: "linear-gradient(135deg, #FF6B35, #00BFA6)" }}>
              🎯
            </div>
            <div className="min-w-0">
              <p className="font-black text-white text-sm leading-tight truncate" style={{ fontFamily: "Rubik, sans-serif" }}>
                {campaign.name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] font-mono" style={{ color: "#00BFA6" }}>/{campaignSlug}</p>
                {isSupervisor && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/25">
                    Supervisor
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isSupervisor && (
              <Link href="/create-campaign" className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: "rgba(0,191,166,0.1)", color: "#00BFA6", border: "1px solid rgba(0,191,166,0.2)" }}>
                <Plus className="w-3.5 h-3.5" /> New Campaign
              </Link>
            )}
            {!isSupervisor && (
              <button onClick={() => setShowQrModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <QrCode className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">QR Code</span>
              </button>
            )}
            <Link href={`/tv?c=${campaignSlug}`} target="_blank" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Tv className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">TV</span>
            </Link>
            <Link href={`/kiosk?c=${campaignSlug}`} target="_blank" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all" style={{ background: "rgba(0,191,166,0.08)", color: "#00BFA6", border: "1px solid rgba(0,191,166,0.25)" }}>
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kiosk</span>
            </Link>
            {!isSupervisor && (
              <button
                onClick={handleOpenClearModal}
                disabled={clearing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all text-red-400 bg-red-950/30 border border-red-500/30 hover:bg-red-900/40 cursor-pointer"
                title="Clear all spin participants and reset prize stock counts for this campaign in Firestore (Admin Password Required)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Clear DB</span>
              </button>
            )}
            {sessionExpiresAt && (
              <button
                type="button"
                onClick={handleRefreshToken}
                disabled={refreshingToken}
                title="Click to refresh 1-hour session token"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-bold bg-white/5 border border-white/10 hover:border-teal-500/40 hover:bg-white/10 text-white/80 transition-all cursor-pointer"
              >
                <Clock className={`w-3.5 h-3.5 ${refreshingToken ? "animate-spin text-teal-400" : "text-teal-400"}`} />
                <span>
                  {(() => {
                    const diff = Math.max(0, sessionExpiresAt - currentTimeMs);
                    const mins = Math.floor(diff / 60000);
                    const secs = Math.floor((diff % 60000) / 1000);
                    if (mins > 0) return `${mins}m left`;
                    return `${secs}s left`;
                  })()}
                </span>
                <span className="text-[9px] font-sans uppercase font-bold text-teal-300 opacity-60">
                  {refreshingToken ? "..." : "↻"}
                </span>
              </button>
            )}
            <button onClick={handleLogout} className="p-2 rounded-xl text-xs transition-colors hover:text-red-400" style={{ color: "rgba(255,255,255,0.3)" }}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-5">

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Spins", value: totalParticipants, color: "#00BFA6", icon: Activity },
            { label: "Winners", value: winnersCount, color: "#10b981", icon: Trophy },
            { label: "Win Rate", value: `${winRate}%`, color: "#FF6B35", icon: Target },
            { label: "Segments", value: campaign.prizes.length, color: "#a78bfa", icon: Layers },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="rounded-2xl p-4 flex items-center gap-4" style={{ background: `${color}0d`, border: `1px solid ${color}25` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-2xl font-black leading-none font-mono" style={{ color, fontFamily: "Rubik, sans-serif" }}>{value}</p>
                <p className="text-xs mt-0.5 font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Save Bar ── */}
        <div className="rounded-2xl px-5 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <p className="font-bold text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Campaign Settings</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Changes propagate live to all attendees.</p>
          </div>
          <div className="flex items-center gap-3">
            {saveSuccess && <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400"><CheckCircle className="w-3.5 h-3.5" /> Saved!</span>}
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-50 transition-all hover:opacity-90 active:scale-[0.98]" style={{ background: "linear-gradient(135deg, #00BFA6, #0D9488)", boxShadow: "0 4px 14px rgba(0,191,166,0.3)", fontFamily: "Rubik, sans-serif" }}>
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all"
                style={{
                  background: active ? "rgba(255,255,255,0.08)" : "transparent",
                  color: active ? "#ffffff" : "rgba(255,255,255,0.35)",
                  border: active ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                  fontFamily: "Rubik, sans-serif",
                }}
              >
                <Icon className="w-4 h-4" style={{ color: active ? "#00BFA6" : undefined }} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Analytics Tab ── */}
        {activeTab === "analytics" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between">
                <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Prize Distribution & Inventory</h3>
                <span className="text-xs font-bold text-white/40">Claimed / Stock</span>
              </div>
              <div className="space-y-4">
                {campaign.prizes.map(prize => {
                  const count = participants.filter(p => p.prizeId === prize.id).length || prize.claimedCount || 0;
                  const pct = totalParticipants ? Math.round((count / totalParticipants) * 100) : 0;
                  const hasLimit = prize.quantity !== undefined && prize.quantity !== null && prize.quantity >= 0;
                  const remaining = hasLimit ? Math.max(0, prize.quantity! - count) : Infinity;
                  const isOut = !prize.isLosing && hasLimit && remaining <= 0;

                  return (
                    <div key={prize.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="flex items-center gap-2 truncate" style={{ color: "rgba(255,255,255,0.8)" }}>
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: prize.color }} />
                          <span className="truncate">{prize.label}</span>
                          {isOut && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 font-mono uppercase">OUT</span>}
                        </span>
                        <span className="font-mono text-xs flex-shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {count} {hasLimit ? `/ ${prize.quantity}` : ""} {hasLimit ? `(${remaining} left)` : "claimed"}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 2)}%`, background: isOut ? "#ef4444" : prize.color, boxShadow: `0 0 6px ${isOut ? "#ef4444" : prize.color}60` }} />
                      </div>
                    </div>
                  );
                })}
                {!campaign.prizes.length && <p className="text-center py-6 text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>No prizes configured.</p>}
              </div>
            </div>

            <div className="rounded-2xl p-6 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Recent Activations</h3>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {participants.slice(0, 10).map((p, i) => (
                  <div key={p.id || i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs" style={{ background: p.won ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)" }}>
                        {p.won ? "🏆" : "✗"}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white leading-tight">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>{p.phone}</p>
                          {(p.ageRange || p.gender) && (
                            <span className="text-[10px] text-teal-300/70 font-semibold">
                              • {[p.ageRange ? `${p.ageRange} yrs` : "", p.gender].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs font-bold" style={{ color: p.won ? "#10b981" : "rgba(255,255,255,0.3)" }}>{p.prizeLabel}</p>
                  </div>
                ))}
                {!participants.length && <p className="text-center py-8 text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>No activations yet.</p>}
              </div>
            </div>

            {/* ── Demographics Breakdown (Age & Gender) ── */}
            <div className="col-span-1 lg:col-span-2 rounded-2xl p-6 space-y-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-white text-base" style={{ fontFamily: "Rubik, sans-serif" }}>Audience Demographics Breakdown</h3>
                  <p className="text-xs mt-0.5 text-white/40">Real-time age and gender distribution of registered campaign participants.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-950/40 border border-purple-500/30 text-purple-300">
                    {totalParticipants} Registrations
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Age Distribution */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    Age Group Distribution
                  </h4>
                  <div className="space-y-2.5">
                    {AGE_RANGES.map(range => {
                      const count = participants.filter(p => p.ageRange === range).length;
                      const pct = totalParticipants ? Math.round((count / totalParticipants) * 100) : 0;
                      return (
                        <div key={range} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-white/80 font-bold">{range} years</span>
                            <span className="text-white/40 font-mono">{count} ({pct}%)</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.max(pct, count > 0 ? 3 : 0)}%`,
                                background: "linear-gradient(90deg, #8b5cf6, #a78bfa)",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Gender Distribution */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-teal-400" />
                    Gender Distribution
                  </h4>
                  <div className="space-y-2.5">
                    {GENDERS.map(g => {
                      const count = participants.filter(p => p.gender === g).length;
                      const pct = totalParticipants ? Math.round((count / totalParticipants) * 100) : 0;
                      const barColor = g === "Female" ? "linear-gradient(90deg, #ec4899, #f472b6)" : g === "Male" ? "linear-gradient(90deg, #00BFA6, #38bdf8)" : "linear-gradient(90deg, #94a3b8, #cbd5e1)";
                      return (
                        <div key={g} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-white/80 font-bold">{g}</span>
                            <span className="text-white/40 font-mono">{count} ({pct}%)</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.max(pct, count > 0 ? 3 : 0)}%`,
                                background: barColor,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Branding Tab ── */}
        {activeTab === "branding" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Campaign Copy</h3>
              <div className="space-y-4">
                {[
                  { label: "Campaign Name", key: "name", type: "text", placeholder: "e.g. Dettol Hygiene Challenge" },
                  { label: "Sub-Brand / Tagline", key: "subTitle", type: "text", placeholder: "e.g. GOLDEN MORN" },
                  { label: "Brand Logo URL", key: "logoUrl", type: "url", placeholder: "https://example.com/logo.png" },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</label>
                    <input type={type} value={(campaign as any)[key] || ""} onChange={e => setCampaign({ ...campaign, [key]: e.target.value })} placeholder={placeholder}
                      className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      onFocus={e => (e.target.style.borderColor = "rgba(0,191,166,0.5)")}
                      onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.08)")} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Welcome Message</label>
                  <textarea rows={2} value={campaign.welcomeMessage} onChange={e => setCampaign({ ...campaign, welcomeMessage: e.target.value })}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none resize-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
                <div className="space-y-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {[{ key: "oneSpinPerPhone", label: "1 Spin per Phone" }, { key: "active", label: "Campaign Active" }].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{label}</span>
                      <button type="button" onClick={() => setCampaign({ ...campaign, [key]: !(campaign as any)[key] })}
                        className="relative w-11 h-6 rounded-full transition-all"
                        style={{ background: (campaign as any)[key] ? "linear-gradient(135deg, #00BFA6, #0D9488)" : "rgba(255,255,255,0.1)", boxShadow: (campaign as any)[key] ? "0 0 10px rgba(0,191,166,0.4)" : "none" }}>
                        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: (campaign as any)[key] ? "calc(100% - 22px)" : "2px" }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Theme & Full-Page Visual Identity</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Primary Accent", key: "primaryColor" },
                  { label: "Secondary Accent", key: "secondaryColor" },
                  { label: "Gradient Start", key: "gradientStart" },
                  { label: "Gradient End", key: "gradientEnd" },
                  { label: "Base Background", key: "backgroundColor" },
                ].map(({ label, key }) => (
                  <div key={key} className={key === "backgroundColor" ? "col-span-2" : ""}>
                    <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={(campaign as any)[key] || (key === "backgroundColor" ? "#070d14" : "#00BFA6")} onChange={e => setCampaign({ ...campaign, [key]: e.target.value })}
                        className="w-11 h-11 rounded-xl cursor-pointer border-0 p-1" style={{ background: "rgba(255,255,255,0.05)" }} />
                      <input type="text" value={(campaign as any)[key] || ""} onChange={e => setCampaign({ ...campaign, [key]: e.target.value })}
                        className="w-full rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-bold mb-3 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Preset Color Schemes</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: "Brand Default", start: "#FF6B35", end: "#00BFA6", bg: "#070d14", pri: "#00BFA6", sec: "#FF6B35" },
                    { name: "Minimal White", start: "#FFFFFF", end: "#94A3B8", bg: "#090D14", pri: "#FFFFFF", sec: "#38BDF8" },
                    { name: "Deep Ocean", start: "#0D1B2A", end: "#00BFA6", bg: "#06101c", pri: "#00BFA6", sec: "#38bdf8" },
                    { name: "Sunset Blaze", start: "#FF6B35", end: "#e11d48", bg: "#140608", pri: "#FF6B35", sec: "#fbbf24" },
                    { name: "Neon Violet", start: "#8b5cf6", end: "#ec4899", bg: "#0d0618", pri: "#8b5cf6", sec: "#ec4899" },
                    { name: "Emerald Gold", start: "#10b981", end: "#f59e0b", bg: "#04140d", pri: "#10b981", sec: "#f59e0b" },
                  ].map(p => (
                    <button key={p.name} onClick={() => setCampaign({ ...campaign, gradientStart: p.start, gradientEnd: p.end, backgroundColor: p.bg, primaryColor: p.pri, secondaryColor: p.sec })}
                      className="p-3 rounded-xl flex items-center gap-3 text-left transition-all hover:scale-[1.02] cursor-pointer"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="w-8 h-8 rounded-lg flex-shrink-0 shadow border border-white/20" style={{ background: `linear-gradient(135deg, ${p.start}, ${p.end})` }} />
                      <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                    Live Preview & Contrast Feedback
                  </label>
                  {(isLightColor(campaign.primaryColor || "") || isLightColor(campaign.secondaryColor || "") || isLightColor(campaign.gradientStart || "") || isLightColor(campaign.gradientEnd || "")) && (
                    <span className="text-[10px] text-teal-300 font-bold bg-teal-950/50 border border-teal-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3 text-teal-400" />
                      Auto High-Contrast Mode Active
                    </span>
                  )}
                </div>

                <div className="w-full h-32 rounded-2xl flex flex-col items-center justify-center text-white border border-white/10 p-3 relative overflow-hidden" style={{
                  background: `radial-gradient(circle at 20% 20%, ${campaign.gradientStart || "#FF6B35"}60 0%, transparent 60%), radial-gradient(circle at 80% 80%, ${campaign.gradientEnd || "#00BFA6"}50 0%, transparent 60%), ${campaign.backgroundColor || "#070d14"}`,
                  fontFamily: "Rubik, sans-serif",
                }}>
                  <span className="text-base font-black">{campaign.name || "Live Aura Preview"}</span>
                  {campaign.subTitle && (
                    <span
                      className="text-[10px] uppercase font-bold mt-1 px-2.5 py-0.5 rounded-full"
                      style={{
                        color: isLightColor(campaign.secondaryColor) ? "#ffffff" : (campaign.secondaryColor || "#FF6B35"),
                        background: isLightColor(campaign.secondaryColor) ? "rgba(255,255,255,0.18)" : `${campaign.secondaryColor || "#FF6B35"}20`,
                        border: `1px solid ${isLightColor(campaign.secondaryColor) ? "rgba(255,255,255,0.3)" : `${campaign.secondaryColor || "#FF6B35"}40`}`,
                      }}
                    >
                      {campaign.subTitle}
                    </span>
                  )}
                  <div
                    className="mt-2.5 px-3.5 py-1 rounded-xl text-xs font-black shadow-md"
                    style={{
                      background: `linear-gradient(135deg, ${campaign.primaryColor || "#00BFA6"}, ${campaign.secondaryColor || "#FF6B35"})`,
                      color: getGradientContrastColor(campaign.primaryColor || "#00BFA6", campaign.secondaryColor || "#FF6B35"),
                    }}
                  >
                    🎡 Spin Button Contrast Preview
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Prizes Tab ── */}
        {activeTab === "prizes" && (
          <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Wheel Segments & Gift Inventory Pool · {campaign.prizes.length}</h3>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Set probability weights and initial gift stock limits. Items automatically stop winning when out of stock.</p>
              </div>
              <button onClick={handleAddPrize} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #FF6B35, #e0531f)", boxShadow: "0 4px 12px rgba(255,107,53,0.3)" }}>
                <Plus className="w-3.5 h-3.5" /> Add Segment
              </button>
            </div>
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {campaign.prizes.map((prize, idx) => {
                const prob = totalWeight > 0 ? Math.round((Math.max(prize.weight, 0) / totalWeight) * 100) : 0;
                const wonCount = participants.filter(p => p.prizeId === prize.id).length || prize.claimedCount || 0;
                const hasLimit = prize.quantity !== undefined && prize.quantity !== null && prize.quantity >= 0;
                const remaining = hasLimit ? Math.max(0, prize.quantity! - wonCount) : Infinity;
                const isOutOfStock = !prize.isLosing && hasLimit && remaining <= 0;

                return (
                  <div key={prize.id || idx} className={`rounded-xl p-4 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 transition-all ${isOutOfStock ? "opacity-75 bg-red-950/20 border-red-500/30" : "bg-white/[0.03] border-white/5"}`} style={{ border: isOutOfStock ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.06)" }}>
                    {/* Left: Color + Label */}
                    <div className="flex items-center gap-3 w-full xl:w-auto">
                      <span className="text-xs font-mono w-5 text-center" style={{ color: "rgba(255,255,255,0.2)" }}>{idx + 1}</span>
                      <input type="color" value={prize.color} onChange={e => handleUpdatePrize(idx, "color", e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border-0 flex-shrink-0" style={{ background: "transparent" }} />
                      <input type="text" value={prize.label} onChange={e => handleUpdatePrize(idx, "label", e.target.value)} placeholder="Prize label"
                        className="flex-1 xl:w-44 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }} />
                    </div>

                    {/* Middle: Weight + Probability */}
                    <div className="flex items-center gap-3 flex-wrap w-full xl:w-auto justify-between xl:justify-end">
                      <div className="flex items-center gap-1.5" title="Relative Probability Weight">
                        <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>Wt.</span>
                        <input type="number" min="0" value={prize.weight} onChange={e => handleUpdatePrize(idx, "weight", Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-14 rounded-lg px-2 py-1.5 text-xs text-white text-center font-mono outline-none"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }} />
                        <div className="px-2 py-1 rounded-lg text-xs font-black font-mono" style={{ background: `${prize.color}20`, color: prize.color, border: `1px solid ${prize.color}30` }}>
                          {prob}%
                        </div>
                      </div>

                      {/* Gift Stock Pool Controls */}
                      {!prize.isLosing ? (
                        <div className="flex items-center gap-2 bg-white/[0.04] p-1.5 rounded-lg border border-white/5">
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] font-bold uppercase" style={{ color: "rgba(255,255,255,0.35)" }}>Stock Limit</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="∞"
                              value={prize.quantity !== undefined && prize.quantity !== null ? prize.quantity : ""}
                              onChange={e => {
                                const val = e.target.value === "" ? undefined : Math.max(0, parseInt(e.target.value) || 0);
                                handleUpdatePrize(idx, "quantity", val);
                              }}
                              className="w-16 rounded-md px-2 py-1 text-xs text-white text-center font-mono outline-none"
                              style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
                              title="Leave empty for unlimited stock"
                            />
                          </div>

                          <div className="h-4 w-px bg-white/10" />

                          {/* Inventory Badges */}
                          <div className="flex items-center gap-1.5 text-xs font-bold font-mono flex-wrap">
                            <span className="text-emerald-400">{wonCount} won</span>
                            <span className="text-white/20">/</span>
                            {isOutOfStock ? (
                              <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] uppercase tracking-wider animate-pulse">
                                Out of Stock
                              </span>
                            ) : (
                              <span className="text-teal-300">
                                {hasLimit ? `${remaining} left` : "∞ stock"}
                              </span>
                            )}
                            {hasLimit && (campaign.stores?.length || 0) > 0 && (
                              <span className="text-[10px] text-amber-300/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-sans">
                                ~{Math.floor(prize.quantity! / campaign.stores!.length)}/store ({campaign.stores!.length} stores)
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-white/30 px-3">No stock limit (Loss)</span>
                      )}

                      {/* Loss Checkbox — admin only */}
                      {!isSupervisor && (
                        <label className="flex items-center gap-1.5 cursor-pointer px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <input type="checkbox" checked={!!prize.isLosing} onChange={e => handleUpdatePrize(idx, "isLosing", e.target.checked)} className="w-3.5 h-3.5 accent-red-500 cursor-pointer" />
                          <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Loss</span>
                        </label>
                      )}

                      {/* Global Pause Toggle — admin only */}
                      {!isSupervisor && !prize.isLosing && (
                        <button
                          onClick={async () => {
                            setPauseLoading(prize.id);
                            try {
                              if (prize.globallyPaused) {
                                await unpausePrizeGlobally(campaign.id, prize.id);
                                setCampaign(prev => ({ ...prev, prizes: prev.prizes.map(p => p.id === prize.id ? { ...p, globallyPaused: false } : p) }));
                              } else {
                                await pausePrizeGlobally(campaign.id, prize.id);
                                setCampaign(prev => ({ ...prev, prizes: prev.prizes.map(p => p.id === prize.id ? { ...p, globallyPaused: true } : p) }));
                              }
                            } finally { setPauseLoading(null); }
                          }}
                          disabled={pauseLoading === prize.id}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          style={{
                            background: prize.globallyPaused ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${prize.globallyPaused ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.06)"}`,
                            color: prize.globallyPaused ? "#f87171" : "rgba(255,255,255,0.45)",
                          }}
                          title={prize.globallyPaused ? "Globally Paused — click to restore" : "Pause globally across all stores"}
                        >
                          {prize.globallyPaused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                          {prize.globallyPaused ? "Paused" : "Pause"}
                        </button>
                      )}

                      {/* Delete — admin only */}
                      {!isSupervisor && (
                        <button onClick={() => handleDeletePrize(idx)} className="p-2 rounded-lg transition-colors hover:text-red-400" style={{ color: "rgba(255,255,255,0.2)" }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Per-Store Prize Management Hub (Admin & Supervisor) ── */}
            {((isSupervisor && activeSupervisor && supervisorStores.length > 0) || (!isSupervisor && (campaign.stores || []).length > 0)) && (
              <div className="mt-8 space-y-5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "2rem" }}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h4 className="font-black text-white text-base flex items-center gap-2" style={{ fontFamily: "Rubik, sans-serif" }}>
                      <Building2 className="w-5 h-5 text-teal-400" />
                      Per-Store Prize Availability & Overrides
                    </h4>
                    <p className="text-xs mt-1 text-white/40">
                      {isSupervisor
                        ? "Pause or resume prizes at the retail locations you supervise when gifts run out. Changes apply instantly to live wheels."
                        : "Look through any store to pause or resume prizes when physical stock runs out or replenishes at that specific location."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">
                      {storesWithPausedCount > 0 ? (
                        <span className="text-amber-300 font-bold">⏸️ {storesWithPausedCount} store(s) with paused prizes</span>
                      ) : (
                        <span className="text-emerald-400 font-bold">✅ All store wheels active</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Search and Filters Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="sm:col-span-5 relative">
                    <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors pointer-events-none ${storePrizeSearch ? "text-teal-400" : "text-white/40"
                      }`} />
                    <input
                      type="text"
                      placeholder="Search stores (name, code, city) or prize item..."
                      value={storePrizeSearch}
                      onChange={e => setStorePrizeSearch(e.target.value)}
                      className="w-full pl-10 pr-20 py-2.5 rounded-xl text-xs text-white outline-none placeholder-white/30 transition-all focus:border-teal-500/50"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    />
                    {storePrizeSearch && (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30">
                          {filteredStorePrizes.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStorePrizeSearch("")}
                          className="text-white/40 hover:text-white p-1 rounded transition-colors"
                          title="Clear search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {!isSupervisor && (
                    <div className="sm:col-span-3">
                      <select
                        value={storePrizeStateFilter}
                        onChange={e => setStorePrizeStateFilter(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl text-xs text-white outline-none cursor-pointer"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <option value="all" style={{ background: "#070d14", color: "#ffffff" }}>All States</option>
                        {NIGERIAN_STATES.map(st => (
                          <option key={st} value={st} style={{ background: "#070d14", color: "#ffffff" }}>{st}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className={`${isSupervisor ? "sm:col-span-7" : "sm:col-span-4"} flex items-center gap-1.5 overflow-x-auto`}>
                    <button
                      type="button"
                      onClick={() => setStorePrizeStatusFilter("all")}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${storePrizeStatusFilter === "all"
                        ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                        : "bg-white/5 text-white/40 hover:text-white border border-transparent"
                        }`}
                    >
                      All ({storesToDisplay.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStorePrizeStatusFilter("paused")}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${storePrizeStatusFilter === "paused"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-white/5 text-white/40 hover:text-white border border-transparent"
                        }`}
                    >
                      Paused ({storesWithPausedCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStorePrizeStatusFilter("active")}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${storePrizeStatusFilter === "active"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-white/5 text-white/40 hover:text-white border border-transparent"
                        }`}
                    >
                      Active ({storesToDisplay.length - storesWithPausedCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetAllExpanded(!allFilteredExpanded)}
                      className="px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 ml-auto"
                      title={allFilteredExpanded ? "Collapse all store accordions" : "Expand all store accordions"}
                    >
                      <ChevronsUpDown className="w-3.5 h-3.5 text-teal-400" />
                      <span>{allFilteredExpanded ? "Collapse All" : "Expand All"}</span>
                    </button>
                  </div>
                </div>

                {/* Store Cards Grid / Accordions */}
                {filteredStorePrizes.length === 0 ? (
                  <div className="text-center py-10 rounded-2xl border border-white/5 bg-white/[0.01] space-y-2">
                    <p className="text-2xl">🔍</p>
                    <p className="text-sm font-bold text-white">No stores match your search or filters.</p>
                    <button
                      onClick={() => { setStorePrizeSearch(""); setStorePrizeStateFilter("all"); setStorePrizeStatusFilter("all"); }}
                      className="text-xs text-teal-400 hover:underline font-bold"
                    >
                      Clear search filters
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {filteredStorePrizes.map(store => {
                      const pausedList = store.pausedPrizes || [];
                      const winningPrizes = campaign.prizes.filter(p => !p.isLosing);
                      const hasPaused = pausedList.length > 0;
                      // Default is collapsed unless search query is typed or user explicitly expanded it
                      const isExpanded = expandedStores[store.id] ?? (storePrizeSearch.trim().length > 0);

                      return (
                        <div
                          key={store.id}
                          className="rounded-2xl transition-all overflow-hidden"
                          style={{
                            background: hasPaused ? "rgba(245, 158, 11, 0.02)" : "rgba(255,255,255,0.02)",
                            border: hasPaused ? "1px solid rgba(245, 158, 11, 0.2)" : "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {/* Store Card Header (Clickable Accordion Trigger) */}
                          <div
                            onClick={() => toggleStoreExpanded(store.id)}
                            className="flex items-center justify-between gap-3 p-4 cursor-pointer hover:bg-white/[0.04] transition-colors select-none"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${hasPaused
                                ? "bg-amber-500/15 border border-amber-500/30 text-amber-300"
                                : "bg-teal-500/15 border border-teal-500/30 text-teal-300"
                                }`}>
                                <Building2 className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h5 className="text-sm font-black text-white truncate" style={{ fontFamily: "Rubik, sans-serif" }}>
                                    {store.name}
                                  </h5>
                                  {store.state && (
                                    <span className="text-[10px] font-bold text-white/50 bg-white/5 border border-white/10 px-1.5 py-0.2 rounded">
                                      {store.state}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-teal-400/80">
                                  <span>{store.code}{store.city ? ` · ${store.city}` : ""}</span>
                                  <span className="text-white/30 font-sans">· {winningPrizes.length} prizes</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {hasPaused ? (
                                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                  ⏸️ {pausedList.length} Paused
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                  ✅ All Active
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedStoreForPrizes(store);
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                                title="Open Focused Prize Manager"
                              >
                                Manage
                              </button>
                              <div className="p-1 rounded-lg text-white/40 group-hover:text-white transition-colors">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-teal-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-white/40" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Quick Summary Preview when Collapsed with Paused Prizes */}
                          {!isExpanded && hasPaused && (
                            <div className="px-4 pb-3 pt-0 text-[11px] text-amber-400/80 flex items-center gap-1.5 truncate border-t border-white/5 pt-2">
                              <span className="font-bold">Paused items:</span>
                              <span className="truncate">
                                {winningPrizes.filter(p => pausedList.includes(p.id)).map(p => p.label).join(", ")}
                              </span>
                            </div>
                          )}

                          {/* Prize Items List (Collapsible Body) */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-2 animate-fadeIn">
                              {winningPrizes.map(prize => {
                                const isPaused = pausedList.includes(prize.id);
                                const isGloballyPaused = !!prize.globallyPaused;
                                const storeQuota = getStorePrizeQuota(campaign, store.code || store.id, prize.id);
                                const claimedAtStore = participants.filter(
                                  p => (p.storeCode?.toLowerCase() === (store.code || "").toLowerCase() || p.storeCode === store.id) && p.prizeId === prize.id
                                ).length;
                                const storeRemaining = storeQuota !== null ? Math.max(0, storeQuota - claimedAtStore) : Infinity;
                                const isStoreOutOfStock = storeQuota !== null && storeRemaining <= 0;

                                return (
                                  <div
                                    key={prize.id}
                                    className={`flex items-center justify-between py-2 px-3 rounded-xl transition-all ${isPaused
                                      ? "bg-amber-500/10 border border-amber-500/20"
                                      : isGloballyPaused
                                        ? "bg-red-500/5 border border-red-500/15 opacity-60"
                                        : isStoreOutOfStock
                                          ? "bg-red-950/20 border border-red-500/20 opacity-80"
                                          : "bg-white/[0.02] border border-white/5"
                                      }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: prize.color }} />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-xs font-bold text-white truncate">{prize.label}</span>
                                          {isGloballyPaused ? (
                                            <span className="text-[9px] font-bold text-red-400 bg-red-950/40 border border-red-500/25 px-1.5 py-0.2 rounded">
                                              Global Pause
                                            </span>
                                          ) : isPaused ? (
                                            <span className="text-[9px] font-bold text-amber-300 bg-amber-950/40 border border-amber-500/25 px-1.5 py-0.2 rounded">
                                              Paused
                                            </span>
                                          ) : isStoreOutOfStock ? (
                                            <span className="text-[9px] font-bold text-red-400 bg-red-950/40 border border-red-500/25 px-1.5 py-0.2 rounded">
                                              Out of Stock at Store
                                            </span>
                                          ) : (
                                            <span className="text-[9px] font-bold text-teal-300 bg-teal-950/40 border border-teal-500/25 px-1.5 py-0.2 rounded">
                                              Active
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          {isStoreOutOfStock ? (
                                            <span className="text-[10px] font-bold text-red-400 font-mono">
                                              ⚠️ Quota Finished (0 / {storeQuota} left · {claimedAtStore} won)
                                            </span>
                                          ) : storeRemaining === Infinity ? (
                                            <span className="text-[10px] text-white/40">Unlimited Stock</span>
                                          ) : (
                                            <span className="text-[10px] text-white/50 font-mono">
                                              Store Quota: <span className="text-teal-300 font-bold">{storeRemaining}</span> / {storeQuota} left ({claimedAtStore} won)
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {isGloballyPaused ? (
                                        <span className="text-[10px] text-white/30 italic">Global</span>
                                      ) : isPaused ? (
                                        <button
                                          disabled={pauseLoading === `${store.id}-${prize.id}`}
                                          onClick={() => handleToggleStorePrize(store, prize, false)}
                                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-teal-300 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 flex items-center gap-1 transition-all cursor-pointer"
                                        >
                                          <Play className="w-3 h-3" />
                                          <span>Resume</span>
                                        </button>
                                      ) : (
                                        <button
                                          disabled={pauseLoading === `${store.id}-${prize.id}`}
                                          onClick={() => handleToggleStorePrize(store, prize, true)}
                                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 flex items-center gap-1 transition-all cursor-pointer"
                                        >
                                          <Pause className="w-3 h-3" />
                                          <span>Pause</span>
                                        </button>
                                      )}

                                      {/* Smooth Toggle Switch */}
                                      <button
                                        disabled={isGloballyPaused || pauseLoading === `${store.id}-${prize.id}`}
                                        onClick={() => handleToggleStorePrize(store, prize, !isPaused)}
                                        className={`relative w-10 h-5 rounded-full transition-all flex-shrink-0 ${isGloballyPaused ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                                          }`}
                                        style={{
                                          background: (!isPaused && !isGloballyPaused)
                                            ? "linear-gradient(135deg, #00BFA6, #0D9488)"
                                            : "rgba(255,255,255,0.12)",
                                          boxShadow: (!isPaused && !isGloballyPaused) ? "0 0 8px rgba(0,191,166,0.35)" : "none",
                                        }}
                                        title={isPaused ? "Click to Resume prize" : "Click to Pause prize"}
                                      >
                                        <div
                                          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                                          style={{ left: (!isPaused && !isGloballyPaused) ? "calc(100% - 18px)" : "2px" }}
                                        />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Stores & Brand Ambassadors Tab ── */}
        {activeTab === "stores" && (
          <div className="space-y-6">
            {/* Live feedback toast */}
            {storeToast && (
              <div className="p-3.5 rounded-xl bg-teal-500/15 border border-teal-500/40 text-teal-300 text-xs font-bold flex items-center justify-between animate-fadeIn">
                <span>{storeToast}</span>
                <button onClick={() => setStoreToast(null)} className="text-white/40 hover:text-white">✕</button>
              </div>
            )}

            {/* Create Store Account Card */}
            <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="border-b border-white/10 pb-3">
                <h3 className="font-black text-white text-sm flex items-center gap-2" style={{ fontFamily: "Rubik, sans-serif" }}>
                  <Store className="w-4 h-4 text-teal-400" />
                  Add Store / Brand Ambassador Account
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Create dedicated accounts for retail stores, activation leads, or BAs. Each account generates a distinct TV link & QR code for attendee tracking.
                </p>
              </div>

              <form onSubmit={handleAddStore} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>Store / BA Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Shoprite Ikeja"
                    value={newStoreName}
                    onChange={e => setNewStoreName(e.target.value)}
                    required
                    className="w-full rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>Unique Code</label>
                  <input
                    type="text"
                    placeholder="e.g. shoprite-ikeja"
                    value={newStoreCode}
                    onChange={e => setNewStoreCode(e.target.value)}
                    className="w-full rounded-xl px-3.5 py-2.5 text-xs text-white font-mono outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>City / Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Ikeja"
                    value={newStoreCity}
                    onChange={e => setNewStoreCity(e.target.value)}
                    className="w-full rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>State</label>
                  <select
                    value={newStoreState}
                    onChange={e => setNewStoreState(e.target.value)}
                    className="w-full rounded-xl px-3.5 py-2.5 text-xs text-white outline-none cursor-pointer"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <option value="" style={{ background: "#070d14", color: "rgba(255,255,255,0.5)" }}>Select State (Optional)</option>
                    {NIGERIAN_STATES.map(st => (
                      <option key={st} value={st} style={{ background: "#070d14", color: "#ffffff" }}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>Access PIN</label>
                  <input
                    type="text"
                    placeholder="1234"
                    value={newStorePin}
                    onChange={e => setNewStorePin(e.target.value)}
                    className="w-full rounded-xl px-3.5 py-2.5 text-xs text-white font-mono text-center outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!newStoreName.trim() || storeSaving}
                  className="w-full py-2.5 rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 transition-all hover:opacity-90 disabled:opacity-40 shadow-md cursor-pointer"
                  style={{ background: "linear-gradient(135deg, #00BFA6, #0D9488)", fontFamily: "Rubik, sans-serif" }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {storeSaving ? "Saving Live…" : "Add Store Account"}
                </button>
              </form>
            </div>

            {/* Store Directory Grid */}
            <div className="rounded-2xl p-6 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-white text-sm flex items-center gap-2" style={{ fontFamily: "Rubik, sans-serif" }}>
                    <Store className="w-4 h-4 text-teal-400" />
                    Stores & Brand Ambassadors ({allCampaignStores.length})
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    Real-time activation performance, TV links, QR codes & access control.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">
                    {inactiveStoresCount > 0 ? (
                      <span className="text-amber-300 font-bold">⏸️ {inactiveStoresCount} store(s) paused</span>
                    ) : (
                      <span className="text-emerald-400 font-bold">✅ All {allCampaignStores.length} stores active</span>
                    )}
                  </span>
                  {allCampaignStores.length > 0 && adminRole === "admin" && (
                    <button
                      type="button"
                      onClick={handleOpenRotatePinsModal}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 hover:border-amber-500/50 transition-all cursor-pointer shadow-sm"
                      title="Bulk rotate PINs across stores and export an audit spreadsheet"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Rotate Store PINs</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Search and Filters Bar */}
              {allCampaignStores.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="sm:col-span-5 relative">
                    <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors pointer-events-none ${storeTabSearch ? "text-teal-400" : "text-white/40"
                      }`} />
                    <input
                      type="text"
                      placeholder="Search stores (name, code, city)..."
                      value={storeTabSearch}
                      onChange={e => setStoreTabSearch(e.target.value)}
                      className="w-full pl-10 pr-20 py-2.5 rounded-xl text-xs text-white outline-none placeholder-white/30 transition-all focus:border-teal-500/50"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    />
                    {storeTabSearch && (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30">
                          {filteredStoresTab.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStoreTabSearch("")}
                          className="text-white/40 hover:text-white p-1 rounded transition-colors"
                          title="Clear search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="sm:col-span-3">
                    <select
                      value={storeTabStateFilter}
                      onChange={e => setStoreTabStateFilter(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-xs text-white outline-none cursor-pointer"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <option value="all" style={{ background: "#070d14", color: "#ffffff" }}>All States</option>
                      {NIGERIAN_STATES.map(st => (
                        <option key={st} value={st} style={{ background: "#070d14", color: "#ffffff" }}>{st}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-4 flex items-center gap-1.5 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setStoreTabStatusFilter("all")}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${storeTabStatusFilter === "all"
                        ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                        : "bg-white/5 text-white/40 hover:text-white border border-transparent"
                        }`}
                    >
                      All ({allCampaignStores.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStoreTabStatusFilter("paused")}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${storeTabStatusFilter === "paused"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-white/5 text-white/40 hover:text-white border border-transparent"
                        }`}
                    >
                      Paused ({inactiveStoresCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStoreTabStatusFilter("active")}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${storeTabStatusFilter === "active"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-white/5 text-white/40 hover:text-white border border-transparent"
                        }`}
                    >
                      Active ({activeStoresCount})
                    </button>
                  </div>
                </div>
              )}

              {!allCampaignStores.length ? (
                <div className="text-center py-12 space-y-2">
                  <p className="text-3xl">🏪</p>
                  <p className="text-sm font-bold text-white">No store or BA accounts created yet.</p>
                  <p className="text-xs text-white/40">Use the form above to add retail locations or Brand Ambassadors.</p>
                </div>
              ) : filteredStoresTab.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <p className="text-3xl">🔍</p>
                  <p className="text-sm font-bold text-white">No stores match your search or filter.</p>
                  <p className="text-xs text-white/40">Try searching for a different keyword or reset filters.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setStoreTabSearch("");
                      setStoreTabStateFilter("all");
                      setStoreTabStatusFilter("all");
                    }}
                    className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 hover:bg-teal-500/25 transition-all cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredStoresTab.map((s) => {
                    const storeSpins = participants.filter((p) => isParticipantInStore(p, s));
                    const storeWinners = storeSpins.filter((p) => isParticipantWinner(p, campaign.prizes)).length;
                    const storeWinRate = storeSpins.length ? Math.round((storeWinners / storeSpins.length) * 100) : 0;
                    const storeTvUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/tv?c=${campaignSlug}&store=${s.code}`;
                    const storeWheelUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/?c=${campaignSlug}&store=${s.code}`;

                    const isStoreActive = s.active !== false; // undefined = active by default
                    const isTogglingThisStore = storeToggleLoading === s.id;

                    return (
                      <div
                        key={s.id || s.code}
                        className={`rounded-2xl p-5 space-y-4 relative group transition-all ${isStoreActive
                          ? "bg-white/[0.03] border border-white/10 hover:border-teal-500/40"
                          : "bg-red-950/20 border border-red-500/25 hover:border-red-500/50"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-black text-white text-base truncate leading-tight" style={{ fontFamily: "Rubik, sans-serif" }}>
                                {s.name}
                              </h4>
                              {isStoreActive ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex-shrink-0">
                                  ● Active
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse flex-shrink-0">
                                  ○ Inactive
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap w-max mt-1.5">
                              <span className="text-[11px] font-mono text-teal-400 font-bold">
                                {s.code}
                              </span>
                              {s.city && (
                                <span className="text-[10px] text-white/50">· {s.city}</span>
                              )}
                              {s.state && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                                  {s.state}
                                </span>
                              )}
                              {s.pin && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/10 text-white/80 border border-white/10">
                                  PIN: {s.pin}
                                </span>
                              )}
                              {s.pinRotatedAt && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-teal-500/15 text-teal-300 border border-teal-500/25"
                                  title={`PIN rotated: ${new Date(s.pinRotatedAt).toLocaleString()}`}
                                >
                                  🔄 {new Date(s.pinRotatedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Activate / Deactivate Store Toggle */}
                            <button
                              type="button"
                              disabled={isTogglingThisStore}
                              onClick={() => handleToggleStoreActive(s, !isStoreActive)}
                              title={isStoreActive ? "Deactivate store — blocks all spins" : "Activate store — allow spins"}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer disabled:opacity-50 ${isStoreActive
                                ? "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                                : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                                }`}
                            >
                              {isTogglingThisStore ? (
                                <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
                              ) : isStoreActive ? (
                                <><Pause className="w-3 h-3" /><span>Deactivate</span></>
                              ) : (
                                <><Play className="w-3 h-3" /><span>Activate</span></>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditStore(s)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-teal-500/20 border border-teal-500/40 text-teal-300 hover:bg-teal-500/30 hover:border-teal-400 transition-all cursor-pointer shadow-sm shadow-teal-500/10"
                              title="Edit Store Details (Name, Code, PIN, Location)"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-teal-300" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteStore(s.id)}
                              className="p-1.5 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                              title="Delete Store"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-black/40 border border-white/5 text-center">
                          <div>
                            <p className="text-base font-black font-mono text-white">{storeSpins.length}</p>
                            <p className="text-[9px] uppercase font-bold text-white/40">Spins</p>
                          </div>
                          <div>
                            <p className="text-base font-black font-mono text-emerald-400">{storeWinners}</p>
                            <p className="text-[9px] uppercase font-bold text-white/40">Winners</p>
                          </div>
                          <div>
                            <p className="text-base font-black font-mono text-orange-400">{storeWinRate}%</p>
                            <p className="text-[9px] uppercase font-bold text-white/40">Win Rate</p>
                          </div>
                        </div>

                        {/* Store Prize Availability Status & Quick Pause Action */}
                        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                          <div className="flex items-center gap-2 min-w-0">
                            <Trophy className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                            <span className="text-[11px] text-white/70 font-semibold truncate">Prize Stock:</span>
                            {(s.pausedPrizes || []).length > 0 ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex-shrink-0">
                                ⏸️ {(s.pausedPrizes || []).length} Paused
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30 flex-shrink-0">
                                ✅ All Active
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedStoreForPrizes(s)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 transition-all cursor-pointer flex-shrink-0"
                            title="Pause or resume individual prizes for this store"
                          >
                            <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                            <span>Manage Prizes</span>
                          </button>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(storeWheelUrl);
                              setStoreToast(`📋 Copied attendee link for ${s.name}!`);
                              setTimeout(() => setStoreToast(null), 2500);
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all cursor-pointer"
                            title="Copy Attendee Link"
                          >
                            <Copy className="w-3.5 h-3.5 text-white/60" />
                            <span className="truncate">Copy Link</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedStoreForQr(s);
                              setShowQrModal(true);
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all cursor-pointer"
                          >
                            <QrCode className="w-3.5 h-3.5 text-teal-400" />
                            <span className="truncate">QR Code</span>
                          </button>

                          <Link
                            href={`/tv?c=${campaignSlug}&store=${s.code}`}
                            target="_blank"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-black text-white transition-all hover:opacity-90 shadow-sm"
                            style={{ background: "linear-gradient(135deg, #00BFA6, #0D9488)" }}
                          >
                            <Tv className="w-3.5 h-3.5" />
                            <span className="truncate">Launch TV</span>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Team Tab ── */}
        {activeTab === "team" && !isSupervisor && (
          <TeamTab campaign={campaign} setCampaign={setCampaign} campaignSlug={campaignSlug} updateCampaign={updateCampaign} />
        )}

        {/* ── Participants Tab ── */}
        {activeTab === "export" && (
          <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* ── Header row ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>
                  Participant Registrations ·{" "}
                  <span style={{ color: "#00BFA6" }}>{storeFiltered.length}</span>
                  {dateRangeFilter !== "all" || storeFilter !== "all" ? (
                    <span className="text-[11px] ml-1.5 font-normal" style={{ color: "rgba(255,255,255,0.3)" }}>
                      (filtered from {participants.length} total)
                    </span>
                  ) : null}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Real-time activation entries with store & BA attribution — export to CSV.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {campaign.stores && campaign.stores.length > 0 && (
                  <select
                    value={storeFilter}
                    onChange={e => setStoreFilter(e.target.value)}
                    className="rounded-xl px-3 py-2 text-xs text-white bg-black/40 border border-white/10 outline-none font-bold"
                  >
                    <option value="all" className="bg-slate-900">All Locations / BAs</option>
                    {campaign.stores.map((s) => (
                      <option key={s.id || s.code} value={s.code} className="bg-slate-900">
                        📍 {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                )}
                <input type="text" placeholder="Search name/phone…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="rounded-xl px-4 py-2 text-xs text-white outline-none w-44"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                <button onClick={exportToCSV} disabled={!participants.length}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50 hover:opacity-90 transition-all"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </div>
            </div>

            {/* ── Date Range Filter Pills + Calendar ── */}
            <div className="space-y-3">
              {/* Quick range pills */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-widest mr-1" style={{ color: "rgba(255,255,255,0.25)" }}>Range:</span>
                {DATE_RANGE_OPTIONS.map(opt => {
                  const isActive = dateRangeFilter === opt.key;
                  const isCustom = opt.key === "custom";
                  return (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setDateRangeFilter(opt.key);
                        // Reset custom dates when switching away from custom
                        if (!isCustom) { setCustomFrom(""); setCustomTo(""); }
                      }}
                      className="px-3 py-1 rounded-full text-[11px] font-bold transition-all flex items-center gap-1"
                      style={{
                        background: isActive ? (isCustom ? "rgba(255,215,0,0.15)" : "rgba(0,191,166,0.18)") : "rgba(255,255,255,0.05)",
                        border: isActive ? `1px solid ${isCustom ? "rgba(255,215,0,0.5)" : "rgba(0,191,166,0.5)"}` : "1px solid rgba(255,255,255,0.08)",
                        color: isActive ? (isCustom ? "#FFD700" : "#00BFA6") : "rgba(255,255,255,0.45)",
                        boxShadow: isActive ? `0 0 12px ${isCustom ? "rgba(255,215,0,0.1)" : "rgba(0,191,166,0.15)"}` : "none",
                      }}
                    >
                      {isCustom && <span style={{ fontSize: "10px" }}>📅</span>}
                      {opt.label}
                    </button>
                  );
                })}
                {dateRangeFilter !== "all" && (
                  <button
                    onClick={() => { setDateRangeFilter("all"); setCustomFrom(""); setCustomTo(""); }}
                    className="ml-1 px-2 py-1 rounded-full text-[10px] font-bold transition-all hover:opacity-80"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,100,100,0.3)", color: "rgba(255,150,150,0.7)" }}
                  >
                    ✕ Clear
                  </button>
                )}
              </div>
            </div>

            {/* Custom date range calendar picker — visible only when Custom Range is selected */}
            {dateRangeFilter === "custom" && (
              <div
                className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-end gap-4"
                style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.15)" }}
              >
                <div className="flex items-center gap-2 flex-1">
                  {/* From */}
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "rgba(255,215,0,0.6)" }}>
                      From Date
                    </label>
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo || new Date().toISOString().split("T")[0]}
                      onChange={e => setCustomFrom(e.target.value)}
                      className="w-full rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: customFrom ? "1px solid rgba(255,215,0,0.4)" : "1px solid rgba(255,255,255,0.1)",
                        colorScheme: "dark",
                      }}
                    />
                  </div>

                  <span className="text-white/30 text-xs font-bold mt-5">→</span>

                  {/* To */}
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "rgba(255,215,0,0.6)" }}>
                      To Date
                    </label>
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      max={new Date().toISOString().split("T")[0]}
                      onChange={e => setCustomTo(e.target.value)}
                      className="w-full rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: customTo ? "1px solid rgba(255,215,0,0.4)" : "1px solid rgba(255,255,255,0.1)",
                        colorScheme: "dark",
                      }}
                    />
                  </div>
                </div>

                {/* Live record count summary */}
                <div className="text-right shrink-0">
                  {customFrom && customTo ? (
                    <div className="space-y-0.5">
                      <p className="text-xs font-black" style={{ color: "#FFD700" }}>
                        {storeFiltered.length} records
                      </p>
                      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {customFrom} → {customTo}
                      </p>
                      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                        ready to export
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px]" style={{ color: "rgba(255,215,0,0.4)" }}>
                      Select both dates
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ fontSize: "12px" }}>
                <thead>
                  <tr>
                    {["Name", "Phone", "Age / Gender", "Email", "Prize", "Voucher", "Store Code", "Date & Time"].map(h => (
                      <th key={h} className="pb-3 px-2 font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.25)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {storeFiltered.length === 0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>No records found.</td></tr>
                  ) : storeFiltered.map((p, i) => (
                    <tr key={p.id || i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td className="py-3 px-2 font-bold text-white">{p.name}</td>
                      <td className="py-3 px-2 font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>{p.phone}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {p.ageRange && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/40 text-purple-300 border border-purple-500/20 whitespace-nowrap">
                              {p.ageRange} yrs
                            </span>
                          )}
                          {p.gender && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950/40 text-blue-300 border border-blue-500/20 whitespace-nowrap">
                              {p.gender}
                            </span>
                          )}
                          {!p.ageRange && !p.gender && (
                            <span className="text-[11px] text-white/30">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2" style={{ color: "rgba(255,255,255,0.4)" }}>{p.email || "—"}</td>
                      <td className="py-3 px-2">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: p.won ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)", color: p.won ? "#10b981" : "rgba(255,255,255,0.35)", border: `1px solid ${p.won ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.06)"}` }}>
                          {p.prizeLabel}
                        </span>
                      </td>
                      <td className="py-3 px-2 font-mono" style={{ color: "#00BFA6" }}>{p.voucherCode || "—"}</td>
                      <td className="py-3 px-2">
                        {(() => {
                          const storeCode = p.storeCode || campaign.stores?.find(s => s.name?.toLowerCase() === p.storeName?.toLowerCase())?.code;
                          const storeName = p.storeName || campaign.stores?.find(s => s.code?.toLowerCase() === p.storeCode?.toLowerCase())?.name;
                          return (
                            <div>
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-teal-500/15 border border-teal-500/30 text-teal-300">
                                {storeCode || storeName || "General Stage"}
                              </span>
                              {storeName && storeCode && storeName.toLowerCase() !== storeCode.toLowerCase() && (
                                <p className="text-[10px] text-white/40 mt-0.5 truncate max-w-[140px]" title={storeName}>
                                  {storeName}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-2">
                        <div className="text-white text-xs font-semibold whitespace-nowrap">
                          {new Date(p.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </div>
                        <div className="text-[10px] font-mono whitespace-nowrap" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Lucky Draw Tab ── */}
        {activeTab === "luckydraw" && (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="rounded-3xl p-10 text-center space-y-8 w-full max-w-lg" style={{
              background: "radial-gradient(circle at 50% 30%, rgba(167,139,250,0.1), transparent 70%), rgba(255,255,255,0.03)",
              border: "1px solid rgba(167,139,250,0.15)",
            }}>
              <div className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto shadow-2xl" style={{ background: "linear-gradient(135deg, rgba(167,139,250,0.3), rgba(139,92,246,0.3))", border: "1px solid rgba(167,139,250,0.3)" }}>
                <Dices className="w-12 h-12" style={{ color: "#a78bfa" }} />
              </div>
              <div>
                <h3 className="text-3xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif", letterSpacing: "-0.02em" }}>Live Lucky Draw</h3>
                <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>Randomly selects a grand prize winner from all participants.</p>
              </div>
              {luckyWinner && (
                <div className="rounded-2xl p-6 space-y-2" style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)" }}>
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: "#a78bfa" }}>🎉 Grand Winner!</p>
                  <h2 className="text-4xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>{luckyWinner.name}</h2>
                  <p className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>{luckyWinner.phone}</p>
                </div>
              )}
              <button onClick={triggerLuckyDraw} disabled={isDrawing || !participants.length}
                className="w-full py-4 rounded-2xl font-black text-white text-base disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 8px 24px rgba(124,58,237,0.4)", fontFamily: "Rubik, sans-serif" }}>
                {isDrawing ? "🎲 Drawing…" : "🎰 Run Lucky Draw!"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── QR Modal ── */}
      {showQrModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }} onClick={() => { setShowQrModal(false); setSelectedStoreForQr(null); }}>
          <div className="rounded-3xl p-8 max-w-sm w-full text-center space-y-5" style={{ background: "#0f1823", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                {selectedStoreForQr ? selectedStoreForQr.name : "Scan to Spin"}
              </h3>
              {selectedStoreForQr && (
                <p className="text-xs font-mono text-teal-400 mt-1">
                  Store Tracking Code: {selectedStoreForQr.code}
                </p>
              )}
            </div>
            <div className="bg-white p-5 rounded-2xl mx-auto w-fit shadow-inner">
              <QRCodeSVG
                value={
                  selectedStoreForQr
                    ? `${typeof window !== "undefined" ? window.location.origin : ""}/?c=${campaignSlug}&store=${selectedStoreForQr.code}`
                    : qrUrl
                }
                size={200}
              />
            </div>
            <p className="text-xs font-mono break-all text-white/30">
              {selectedStoreForQr
                ? `${typeof window !== "undefined" ? window.location.origin : ""}/?c=${campaignSlug}&store=${selectedStoreForQr.code}`
                : qrUrl}
            </p>
            <button
              onClick={() => { setShowQrModal(false); setSelectedStoreForQr(null); }}
              className="w-full py-3 rounded-xl text-xs font-bold text-white/60 hover:text-white bg-white/5 border border-white/10"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Clear Database Security Modal ── */}
      {showClearModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(14px)" }}
          onClick={() => { setShowClearModal(false); setClearError(""); }}
        >
          <div
            className="rounded-3xl p-7 max-w-md w-full text-center space-y-5 bg-[#0f1823] border border-red-500/30 shadow-2xl animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-red-400 bg-red-950/40 border border-red-500/40 text-2xl shadow-inner">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-xl font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                Confirm Database Reset
              </h3>
              <p className="text-xs text-white/50 mt-1.5 leading-relaxed">
                This will permanently delete all participant registration & spin records and reset claimed stock counts in Firestore for <span className="font-bold text-white">"{campaign.name}"</span>.
              </p>
            </div>

            <form onSubmit={handleConfirmClearDatabase} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-white/60 mb-1.5 uppercase tracking-wider">
                  Enter Admin Password to Authorize *
                </label>
                <input
                  type="password"
                  value={clearPasswordInput}
                  onChange={e => {
                    setClearPasswordInput(e.target.value);
                    setClearError("");
                  }}
                  placeholder="Admin password"
                  required
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 bg-black/50 border border-white/15 text-white text-sm outline-none focus:border-red-500 transition-all font-mono"
                />
                {clearError && (
                  <p className="text-xs text-red-400 font-bold mt-2 flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{clearError}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowClearModal(false); setClearError(""); }}
                  className="flex-1 py-3 rounded-xl text-xs font-bold text-white/60 hover:text-white bg-white/5 border border-white/10 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={clearing || !clearPasswordInput}
                  className="flex-1 py-3 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-all shadow-lg shadow-red-950 cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ fontFamily: "Rubik, sans-serif" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{clearing ? "Wiping Data…" : "Wipe Campaign Data"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Bulk Store PIN Rotation Security Modal ── */}
      {showRotatePinsModal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fadeIn"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(14px)" }}
          onClick={() => {
            if (!rotateLoading) {
              setShowRotatePinsModal(false);
              setRotateError("");
            }
          }}
        >
          <div
            className="rounded-3xl p-6 sm:p-7 max-w-xl w-full space-y-5 bg-[#0b131e] border border-amber-500/30 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${rotatedResult
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                    : "bg-amber-500/15 border border-amber-500/30 text-amber-400"
                    }`}
                >
                  {rotatedResult ? <CheckCircle className="w-5 h-5" /> : <Key className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                    {rotatedResult ? "PINs Rotated Successfully" : "Bulk Rotate Store & BA PINs"}
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    {rotatedResult
                      ? `Updated ${rotatedResult.rotatedCount} store(s) · Spreadsheet generated`
                      : "Regenerate store access PINs & export distribution spreadsheet"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={rotateLoading}
                onClick={() => {
                  setShowRotatePinsModal(false);
                  setRotateError("");
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            {!rotatedResult ? (
              <form onSubmit={handleConfirmRotatePins} className="space-y-4 overflow-y-auto flex-1 pr-1">
                {/* Notice Card */}
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-200/90 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-300">Security & Operational Notice:</span>
                    <p className="mt-0.5 text-white/70">
                      Rotating PINs updates access passwords in real-time. Brand Ambassadors with active sessions can complete their 1-hour shift uninterrupted, but will require the new PIN on their next login. A clean CSV spreadsheet will automatically download for field supervisor distribution.
                    </p>
                  </div>
                </div>

                {/* Scope Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-white/70 uppercase tracking-wider">
                    Rotation Scope (Region / State)
                  </label>
                  <select
                    value={rotateScopeState}
                    onChange={(e) => setRotateScopeState(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl text-xs text-white outline-none cursor-pointer"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    <option value="all" style={{ background: "#070d14", color: "#ffffff" }}>
                      🌐 All Stores Nationwide ({allCampaignStores.length} stores)
                    </option>
                    {Array.from(new Set(allCampaignStores.map((s) => s.state?.trim()).filter(Boolean))).map((st) => {
                      const count = allCampaignStores.filter(
                        (s) => s.state?.toLowerCase() === (st as string).toLowerCase()
                      ).length;
                      return (
                        <option key={st as string} value={st as string} style={{ background: "#070d14", color: "#ffffff" }}>
                          📍 {st as string} ({count} store{count > 1 ? "s" : ""})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Active Stores Only Toggle */}
                {inactiveStoresCount > 0 && (
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer hover:bg-white/[0.05] transition-all">
                    <input
                      type="checkbox"
                      checked={rotateOnlyActive}
                      onChange={(e) => setRotateOnlyActive(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 bg-black/40 border-white/20 focus:ring-0 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-white">Only rotate currently active stores</span>
                      <span className="text-white/40 block text-[11px]">
                        Skip the {inactiveStoresCount} currently paused store(s)
                      </span>
                    </div>
                  </label>
                )}

                {/* PIN Configuration */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-white/70 uppercase tracking-wider">
                    PIN Format
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRotatePinLength(4)}
                      className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${rotatePinLength === 4
                        ? "bg-amber-500/20 border-amber-500/50 text-white"
                        : "bg-white/[0.03] border-white/10 text-white/50 hover:text-white"
                        }`}
                    >
                      <div className="font-bold text-xs flex items-center justify-between">
                        <span>4 Digits (e.g. 7482)</span>
                        {rotatePinLength === 4 && <Check className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                      <p className="text-[10px] text-white/40 mt-1">Recommended for kiosk touchscreens</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRotatePinLength(6)}
                      className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${rotatePinLength === 6
                        ? "bg-amber-500/20 border-amber-500/50 text-white"
                        : "bg-white/[0.03] border-white/10 text-white/50 hover:text-white"
                        }`}
                    >
                      <div className="font-bold text-xs flex items-center justify-between">
                        <span>6 Digits (e.g. 849201)</span>
                        {rotatePinLength === 6 && <Check className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                      <p className="text-[10px] text-white/40 mt-1">Higher entropy & security</p>
                    </button>
                  </div>
                </div>

                {/* Scope Summary Preview */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between">
                  <span className="text-xs text-white/60">Stores matching this scope:</span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {
                      allCampaignStores.filter((s) => {
                        if (rotateScopeState !== "all" && s.state?.toLowerCase() !== rotateScopeState.toLowerCase())
                          return false;
                        if (rotateOnlyActive && s.active === false) return false;
                        return true;
                      }).length
                    }{" "}
                    store(s)
                  </span>
                </div>

                {/* Password Authorization */}
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <label className="block text-xs font-bold text-white/70 uppercase tracking-wider">
                    Enter Admin Password to Authorize *
                  </label>
                  <input
                    type="password"
                    value={rotatePasswordInput}
                    onChange={(e) => {
                      setRotatePasswordInput(e.target.value);
                      setRotateError("");
                    }}
                    placeholder="Admin password"
                    required
                    autoFocus
                    className="w-full rounded-xl px-4 py-2.5 bg-black/50 border border-white/15 text-white text-sm outline-none focus:border-amber-500 transition-all font-mono"
                  />
                  {rotateError && (
                    <p className="text-xs text-red-400 font-bold mt-2 flex items-center gap-1.5">
                      <X className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{rotateError}</span>
                    </p>
                  )}
                </div>

                {/* Modal Actions */}
                <div className="flex items-center gap-3 pt-3">
                  <button
                    type="button"
                    disabled={rotateLoading}
                    onClick={() => {
                      setShowRotatePinsModal(false);
                      setRotateError("");
                    }}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white/60 hover:text-white bg-white/5 border border-white/10 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={rotateLoading || !rotatePasswordInput.trim()}
                    className="flex-1 py-2.5 rounded-xl text-xs font-black text-black bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 transition-all shadow-lg shadow-amber-950/40 cursor-pointer flex items-center justify-center gap-1.5"
                    style={{ fontFamily: "Rubik, sans-serif" }}
                  >
                    {rotateLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Rotating PINs…</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-3.5 h-3.5" />
                        <span>Confirm & Rotate PINs</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* Success View with CSV Re-download and Stores Preview Table */
              <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-sm text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      {rotatedResult.rotatedCount} Store PIN(s) Successfully Rotated!
                    </h4>
                    <p className="text-xs text-white/60 mt-0.5">
                      The CSV spreadsheet <span className="font-mono text-teal-300 text-[11px]">{rotatedResult.filename}</span> has been downloaded.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadRotatedCsv()}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV Again</span>
                  </button>
                </div>

                {/* Rotated Stores List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-white/50 px-1">
                    <span className="font-bold uppercase tracking-wider text-[10px]">Rotated Store PINs Preview</span>
                    <span className="text-[10px] font-mono">{rotatedResult.stores.length} records</span>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-[#0f1722] text-white/50 border-b border-white/10 text-[10px] uppercase font-mono">
                        <tr>
                          <th className="py-2 px-3">Store Name</th>
                          <th className="py-2 px-3">Location</th>
                          <th className="py-2 px-3">Store Code</th>
                          <th className="py-2 px-3 text-right">New PIN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-white/80">
                        {rotatedResult.stores.map((st) => (
                          <tr key={st.id || st.code} className="hover:bg-white/[0.02]">
                            <td className="py-2 px-3 font-semibold text-white">{st.name}</td>
                            <td className="py-2 px-3 text-white/50 text-[11px]">
                              {st.city ? `${st.city}, ` : ""}
                              {st.state || "—"}
                            </td>
                            <td className="py-2 px-3 font-mono text-teal-400 text-[11px]">{st.code}</td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                                    navigator.clipboard.writeText(st.newPin);
                                    setCopiedPinStoreId(st.id);
                                    setTimeout(() => setCopiedPinStoreId(null), 2000);
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-bold hover:bg-amber-500/25 transition-all cursor-pointer"
                                title="Click to copy PIN"
                              >
                                <span>{st.newPin}</span>
                                {copiedPinStoreId === st.id ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3 text-amber-400/60" />
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Close Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRotatePinsModal(false);
                      setRotatedResult(null);
                      setRotateError("");
                    }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/15 border border-white/10 transition-all cursor-pointer"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Store Prize Management Modal ── */}
      {selectedStoreForPrizes && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fadeIn"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(14px)" }}
          onClick={() => setSelectedStoreForPrizes(null)}
        >
          <div
            className="rounded-3xl p-6 sm:p-7 max-w-xl w-full space-y-5 bg-[#0b131e] border border-white/15 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 flex-shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                      {selectedStoreForPrizes.name}
                    </h3>
                    {selectedStoreForPrizes.state && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                        {selectedStoreForPrizes.state}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/50 mt-0.5 truncate">
                    Store Code: <span className="font-mono text-teal-400">{selectedStoreForPrizes.code}</span>
                    {selectedStoreForPrizes.city && ` · ${selectedStoreForPrizes.city}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStoreForPrizes(null)}
                className="p-2 rounded-xl text-white/40 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Action Bar & Stats */}
            <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/10 flex-shrink-0">
              <div className="text-xs">
                <span className="text-white/60">Status: </span>
                {(selectedStoreForPrizes.pausedPrizes || []).length > 0 ? (
                  <span className="font-bold text-amber-300">
                    {(selectedStoreForPrizes.pausedPrizes || []).length} of {campaign.prizes.filter(p => !p.isLosing).length} prizes paused
                  </span>
                ) : (
                  <span className="font-bold text-emerald-400">
                    All prizes active on store wheel
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBatchToggleStorePrizes(selectedStoreForPrizes, false)}
                  disabled={pauseLoading === `batch-${selectedStoreForPrizes.id}`}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-teal-300 hover:text-white bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 transition-all cursor-pointer"
                >
                  Resume All
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchToggleStorePrizes(selectedStoreForPrizes, true)}
                  disabled={pauseLoading === `batch-${selectedStoreForPrizes.id}`}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-amber-300 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all cursor-pointer"
                >
                  Pause All
                </button>
              </div>
            </div>

            {/* Prize List Scrollable */}
            <div className="overflow-y-auto space-y-2.5 pr-1 flex-1">
              {campaign.prizes.filter(p => !p.isLosing).map(prize => {
                const isPaused = (selectedStoreForPrizes.pausedPrizes || []).includes(prize.id);
                const isGloballyPaused = !!prize.globallyPaused;
                const storeQuota = getStorePrizeQuota(campaign, selectedStoreForPrizes.code || selectedStoreForPrizes.id, prize.id);
                const claimedAtStore = participants.filter(
                  p => (p.storeCode?.toLowerCase() === (selectedStoreForPrizes.code || "").toLowerCase() || p.storeCode === selectedStoreForPrizes.id) && p.prizeId === prize.id
                ).length;
                const storeRemaining = storeQuota !== null ? Math.max(0, storeQuota - claimedAtStore) : Infinity;
                const isStoreOutOfStock = storeQuota !== null && storeRemaining <= 0;

                return (
                  <div
                    key={prize.id}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${isPaused
                      ? "bg-amber-500/[0.03] border-amber-500/20"
                      : isGloballyPaused
                        ? "bg-red-500/[0.03] border-red-500/20 opacity-60"
                        : isStoreOutOfStock
                          ? "bg-red-950/20 border-red-500/20 opacity-80"
                          : "bg-white/[0.02] border-white/10"
                      }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: prize.color }} />
                        <span className="text-sm font-bold text-white truncate">{prize.label}</span>
                        {isGloballyPaused ? (
                          <span className="text-[10px] font-bold text-red-400 bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded">
                            Global Pause
                          </span>
                        ) : isPaused ? (
                          <span className="text-[10px] font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded">
                            Paused at Store
                          </span>
                        ) : isStoreOutOfStock ? (
                          <span className="text-[10px] font-bold text-red-400 bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded">
                            Out of Stock at Store
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-teal-300 bg-teal-950/40 border border-teal-500/30 px-2 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {isStoreOutOfStock ? (
                          <span className="text-[11px] font-bold text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-500/30 font-mono">
                            ⚠️ Store Quota Finished: 0 of {storeQuota} left ({claimedAtStore} won here)
                          </span>
                        ) : storeRemaining === Infinity ? (
                          <span className="text-[11px] text-white/40">Stock: Unlimited</span>
                        ) : (
                          <span className="text-[11px] font-mono text-white/60">
                            Store Quota: <span className="text-teal-300 font-bold">{storeRemaining}</span> of {storeQuota} left ({claimedAtStore} won here)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isGloballyPaused ? (
                        <span className="text-xs text-white/30 italic">Globally disabled</span>
                      ) : isPaused ? (
                        <button
                          type="button"
                          disabled={pauseLoading === `${selectedStoreForPrizes.id}-${prize.id}`}
                          onClick={() => handleToggleStorePrize(selectedStoreForPrizes, prize, false)}
                          className="px-3 py-2 rounded-xl text-xs font-black text-white bg-teal-600 hover:bg-teal-500 flex items-center gap-1.5 shadow-md shadow-teal-900/30 transition-all cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Resume</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pauseLoading === `${selectedStoreForPrizes.id}-${prize.id}`}
                          onClick={() => handleToggleStorePrize(selectedStoreForPrizes, prize, true)}
                          className="px-3 py-2 rounded-xl text-xs font-black text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pause Prize</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/40 flex-shrink-0">
              <p>💡 Changes sync to store wheels instantly without page reloads.</p>
              <button
                type="button"
                onClick={() => setSelectedStoreForPrizes(null)}
                className="px-4 py-2 rounded-xl font-bold text-white bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Store Location / BA Modal ── */}
      {editingStore && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fadeIn"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(14px)" }}
          onClick={handleCloseEditStore}
        >
          <div
            className="rounded-3xl p-6 sm:p-7 max-w-lg w-full space-y-5 bg-[#0b131e] border border-teal-500/30 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 bg-teal-500/15 border border-teal-500/30 text-teal-300">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white" style={{ fontFamily: "Rubik, sans-serif" }}>
                    Edit Store Location
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Update branch details, code, and BA access credentials.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={editStoreSaving}
                onClick={handleCloseEditStore}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveEditedStore} className="space-y-4 overflow-y-auto pr-1 flex-1">
              {editStoreError && (
                <div className="p-3 rounded-xl text-xs font-semibold bg-red-500/15 border border-red-500/30 text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{editStoreError}</span>
                </div>
              )}

              {/* Store Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1">
                  Store / Chain Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editStoreName}
                  onChange={(e) => setEditStoreName(e.target.value)}
                  placeholder="e.g. Jendol, Justrite, Spar"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none transition-all"
                />
              </div>

              {/* Store Code */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1">
                  Store Code / URL Slug <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editStoreCode}
                  onChange={(e) => setEditStoreCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ""))}
                  placeholder="e.g. jendol-lekki"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono text-teal-300 bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none transition-all"
                />
                <p className="text-[11px] text-white/40 mt-1">
                  Unique identifier used in kiosk and TV links: <span className="font-mono text-white/60">?store={editStoreCode || "..."}</span>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* City / Branch Area */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1">
                    City / Branch Area
                  </label>
                  <input
                    type="text"
                    value={editStoreCity}
                    onChange={(e) => setEditStoreCity(e.target.value)}
                    placeholder="e.g. Lekki, Egbeda, Ikeja"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none transition-all"
                  />
                </div>

                {/* State */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1">
                    State / Region
                  </label>
                  <select
                    value={editStoreState}
                    onChange={(e) => setEditStoreState(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white bg-slate-900 border border-white/15 focus:border-teal-400 focus:outline-none transition-all"
                  >
                    <option value="">(No State Assigned)</option>
                    {NIGERIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* PIN & Active Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pt-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1">
                    BA Access PIN
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    value={editStorePin}
                    onChange={(e) => setEditStorePin(e.target.value)}
                    placeholder="e.g. 1234"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono tracking-widest text-amber-300 bg-white/5 border border-white/15 focus:border-teal-400 focus:outline-none transition-all"
                  />
                  <p className="text-[10px] text-white/40 mt-1">Used by field BAs to unlock kiosk mode.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1">
                    Store Activation Status
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditStoreActive(!editStoreActive)}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 border transition-all cursor-pointer ${editStoreActive
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25"
                      : "bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25"
                      }`}
                  >
                    {editStoreActive ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        <span>Active (Spins Allowed)</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4 text-red-400" />
                        <span>Inactive (Spins Blocked)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={editStoreSaving}
                  onClick={handleCloseEditStore}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-white/60 hover:text-white bg-white/5 hover:bg-white/10 transition-all cursor-pointer disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editStoreSaving || !editStoreName.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-teal-500 hover:bg-teal-400 transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {editStoreSaving ? (
                    <>
                      <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
