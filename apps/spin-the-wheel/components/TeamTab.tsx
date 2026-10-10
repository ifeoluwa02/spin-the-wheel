"use client";
import { useState } from "react";
import type { Campaign, Supervisor, StoreLocation, CampaignAdmin } from "@/types";
import { NIGERIAN_STATES } from "@/types";
import { getAllCampaignAdmins } from "@/lib/campaign";
import {
  UsersRound, Plus, Trash2, Globe, Building2, ShieldCheck, Eye, EyeOff, Shield,
} from "lucide-react";

interface TeamTabProps {
  campaign: Campaign;
  setCampaign: (updater: (prev: Campaign) => Campaign) => void;
  campaignSlug: string;
  updateCampaign: (c: Campaign) => Promise<void>;
}

export default function TeamTab({ campaign, setCampaign, campaignSlug, updateCampaign }: TeamTabProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [scopeType, setScopeType] = useState<"state" | "stores">("state");
  const [stateValue, setStateValue] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const supervisors: Supervisor[] = campaign.supervisors || [];
  const stores: StoreLocation[] = campaign.stores || [];

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function toggleStoreSelection(id: string) {
    setSelectedStoreIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }

  async function handleAddSupervisor(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) return;
    if (scopeType === "state" && !stateValue.trim()) return;
    if (scopeType === "stores" && !selectedStoreIds.length) return;

    const newSupervisor: Supervisor = {
      id: `sv-${Date.now()}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
      scopeType,
      ...(scopeType === "state" ? { state: stateValue.trim() } : { storeIds: selectedStoreIds }),
    };

    const updated: Campaign = {
      ...campaign,
      supervisors: [...supervisors, newSupervisor],
    };

    setSaving(true);
    try {
      await updateCampaign(updated);
      setCampaign(() => updated);
      setName(""); setEmail(""); setPassword(""); setStateValue(""); setSelectedStoreIds([]);
      showToast(`Supervisor "${newSupervisor.name}" added successfully.`);
    } catch {
      showToast("Failed to save. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(svId: string) {
    if (!window.confirm("Remove this supervisor? They will lose dashboard access immediately.")) return;
    setDeleteLoading(svId);
    const updated: Campaign = {
      ...campaign,
      supervisors: supervisors.filter(sv => sv.id !== svId),
    };
    try {
      await updateCampaign(updated);
      setCampaign(() => updated);
      showToast("Supervisor removed.");
    } catch {
      showToast("Failed to remove. Try again.");
    } finally {
      setDeleteLoading(null);
    }
  }

  function getScopeSummary(sv: Supervisor): string {
    if (sv.scopeType === "state") return `All ${sv.state} stores`;
    const names = (sv.storeIds || []).map(id => stores.find(s => s.id === id)?.name || id);
    return names.join(", ") || "No stores assigned";
  }

  const campaignAdmins = getAllCampaignAdmins(campaign);

  return (
    <div className="space-y-6">
      {toast && (
        <div className="p-3.5 rounded-xl bg-teal-500/15 border border-teal-500/40 text-teal-300 text-xs font-bold">
          {toast}
        </div>
      )}

      {/* ── Project Managers & Admins Card ── */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-teal-500/10 border border-teal-500/20">
              <Shield className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>
                Campaign Admins & Project Managers ({campaignAdmins.length})
              </h3>
              <p className="text-xs mt-0.5 text-white/40">
                Team members with full campaign management privileges. Managed by Super Admin.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {campaignAdmins.map((admin) => (
            <div
              key={admin.id}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/10"
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs bg-teal-500/15 border border-teal-500/30 text-teal-300 flex-shrink-0">
                {(admin.name || admin.email).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-black text-white truncate">{admin.name || "Campaign Admin"}</p>
                  {admin.id === "primary-admin" && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 uppercase">
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-mono text-white/40 truncate">{admin.email}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)" }}>
            <UsersRound className="w-4 h-4" style={{ color: "#fbbf24" }} />
          </div>
          <div>
            <h3 className="font-black text-white text-sm" style={{ fontFamily: "Rubik, sans-serif" }}>Team Management</h3>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Add supervisors who can pause prizes at their stores and download participant data.
            </p>
          </div>
        </div>

        <form onSubmit={handleAddSupervisor} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Full Name</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mary Johnson"
                required className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Login Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="supervisor@brand.com"
                required className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Password</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Set a strong password" required
                className="w-full rounded-xl px-4 py-3 pr-10 text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity">
                {showPass ? <EyeOff className="w-4 h-4 text-white" /> : <Eye className="w-4 h-4 text-white" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Supervisor Scope</label>
            <div className="flex gap-3">
              {(["state", "stores"] as const).map(s => (
                <button key={s} type="button" onClick={() => setScopeType(s)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: scopeType === s ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${scopeType === s ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.08)"}`,
                    color: scopeType === s ? "#fbbf24" : "rgba(255,255,255,0.4)",
                  }}
                >
                  {s === "state" ? <Globe className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                  {s === "state" ? "By State" : "Specific Stores"}
                </button>
              ))}
            </div>
          </div>

          {scopeType === "state" ? (
            <div>
              <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Select State *</label>
              <select
                value={stateValue}
                onChange={e => setStateValue(e.target.value)}
                required={scopeType === "state"}
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none cursor-pointer"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <option value="" style={{ background: "#070d14", color: "rgba(255,255,255,0.5)" }}>Select State</option>
                {NIGERIAN_STATES.map(st => (
                  <option key={st} value={st} style={{ background: "#070d14", color: "#ffffff" }}>
                    {st}
                  </option>
                ))}
              </select>
              <p className="text-[11px] mt-1.5 text-white/30">Supervisor will manage all stores with this state set on their profile.</p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                Select Stores ({selectedStoreIds.length} selected)
              </label>
              {stores.length === 0 ? (
                <p className="text-xs text-white/30 py-3 text-center">No stores created yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {stores.map(store => {
                    const selected = selectedStoreIds.includes(store.id);
                    return (
                      <button key={store.id} type="button" onClick={() => toggleStoreSelection(store.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                        style={{
                          background: selected ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${selected ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.06)"}`,
                        }}
                      >
                        <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                          style={{ background: selected ? "#fbbf24" : "transparent", border: `1.5px solid ${selected ? "#fbbf24" : "rgba(255,255,255,0.2)"}` }}>
                          {selected && <span className="text-black text-[10px] font-black">✓</span>}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white leading-tight">{store.name}</p>
                          {store.state && <p className="text-[11px] text-white/35">{store.state}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black text-black disabled:opacity-50 transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", boxShadow: "0 4px 14px rgba(251,191,36,0.3)", fontFamily: "Rubik, sans-serif" }}>
            <Plus className="w-4 h-4" />
            {saving ? "Adding…" : "Add Supervisor"}
          </button>
        </form>
      </div>

      {supervisors.length > 0 && (
        <div className="rounded-2xl p-6 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h4 className="font-black text-white text-sm flex items-center gap-2" style={{ fontFamily: "Rubik, sans-serif" }}>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            Active Supervisors · {supervisors.length}
          </h4>
          <div className="space-y-3">
            {supervisors.map(sv => (
              <div key={sv.id} className="flex items-center justify-between p-4 rounded-xl"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black"
                    style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24" }}>
                    {sv.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white leading-tight truncate">{sv.name}</p>
                    <p className="text-xs font-mono text-white/35 truncate">{sv.email}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"
                        style={{
                          background: sv.scopeType === "state" ? "rgba(59,130,246,0.12)" : "rgba(16,185,129,0.12)",
                          color: sv.scopeType === "state" ? "#60a5fa" : "#34d399",
                          border: `1px solid ${sv.scopeType === "state" ? "rgba(59,130,246,0.25)" : "rgba(16,185,129,0.25)"}`,
                        }}>
                        {sv.scopeType === "state" ? <Globe className="w-2.5 h-2.5" /> : <Building2 className="w-2.5 h-2.5" />}
                        {sv.scopeType === "state" ? "State" : "Stores"}
                      </span>
                      <span className="text-[11px] text-white/40 truncate">{getScopeSummary(sv)}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => handleDelete(sv.id)} disabled={deleteLoading === sv.id}
                  className="p-2 rounded-lg transition-colors hover:text-red-400 ml-2 flex-shrink-0"
                  style={{ color: "rgba(255,255,255,0.2)" }} title="Remove supervisor">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {supervisors.length === 0 && (
        <div className="py-12 text-center space-y-2">
          <UsersRound className="w-10 h-10 mx-auto" style={{ color: "rgba(255,255,255,0.1)" }} />
          <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.2)" }}>No supervisors yet</p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.12)" }}>Add your first supervisor above to grant field team access.</p>
        </div>
      )}
    </div>
  );
}
