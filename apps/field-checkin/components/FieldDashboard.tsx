"use client";

import React, { useState, useEffect, useMemo } from "react";
import type {
  Campaign,
  StoreLocation,
  CheckInRecord,
  SurveyRecord,
  SurveyQuestion,
} from "@/lib/types";
import { NIGERIAN_STATES } from "@/lib/types";
import { DEFAULT_HOSPITAL_QUESTIONS } from "@/lib/survey-templates";
import { formatDistance, isValidCoordinates } from "@/lib/geo";
import GeofenceMap from "@/components/GeofenceMap";
import FleetOverviewMap, { type CombinedStoreAttendance } from "@/components/FleetOverviewMap";
import {
  MapPin,
  Download,
  Search,
  RefreshCw,
  Clock,
  Camera,
  X,
  Sparkles,
  ClipboardList,
  Calendar,
  BarChart3,
  Map as MapIcon,
  Copy,
  Printer,
  Columns,
  CheckCircle2,
  Filter,
  UserCheck,
  Eye,
} from "lucide-react";

function getLagosTodayStr(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

function shiftDateByDays(baseDateStr: string, deltaDays: number): string {
  const [y, m, d] = baseDateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, (d || 1) + deltaDays));
  return dt.toISOString().split("T")[0];
}

function getMonthStartStr(baseDateStr: string): string {
  const [y, m] = baseDateStr.split("-");
  return `${y}-${m}-01`;
}

function enumerateDatesBetween(startStr: string, endStr: string, maxDays = 31): string[] {
  const minD = startStr <= endStr ? startStr : endStr;
  const maxD = startStr <= endStr ? endStr : startStr;
  const dates: string[] = [];
  let cur = minD;
  let guard = 0;
  while (cur <= maxD && guard < maxDays) {
    dates.push(cur);
    cur = shiftDateByDays(cur, 1);
    guard++;
  }
  return dates;
}

const CHART_PALETTE = [
  "#14B8A6", // Teal
  "#F59E0B", // Amber
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#EC4899", // Pink
  "#8B5CF6", // Violet
  "#F97316", // Orange
  "#06B6D4", // Cyan
];

/**
 * Clean SVG Donut / Pie Chart component for instant built-in Visual Analytics
 * (replaces Akida's slow external Power BI iframe).
 */
function DonutBreakdownChart({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: Array<{ label: string; count: number; color?: string }>;
}) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let accumulatedAngle = 0;

  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-white">{title}</h4>
        {subtitle && <p className="text-[11px] text-white/45 mt-0.5">{subtitle}</p>}
      </div>

      {total === 0 ? (
        <div className="py-10 text-center text-xs text-white/35 font-mono">
          No responses in current filter
        </div>
      ) : (
        <div className="my-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
          <div className="relative w-32 h-32 flex-shrink-0 mx-auto sm:mx-0">
            <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
              {data.map((slice, idx) => {
                if (slice.count <= 0) return null;
                const pct = slice.count / total;
                const strokeDasharray = `${pct * circumference} ${circumference}`;
                const strokeDashoffset = -accumulatedAngle * circumference;
                accumulatedAngle += pct;
                const color = slice.color || CHART_PALETTE[idx % CHART_PALETTE.length];
                return (
                  <circle
                    key={slice.label}
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="transparent"
                    stroke={color}
                    strokeWidth="20"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-lg font-black font-mono text-white">{total}</span>
              <span className="text-[9px] uppercase tracking-wider text-white/45">Total</span>
            </div>
          </div>

          <div className="flex-1 space-y-1.5 min-w-[140px]">
            {data.map((slice, idx) => {
              const pct = total > 0 ? ((slice.count / total) * 100).toFixed(1) : "0.0";
              const color = slice.color || CHART_PALETTE[idx % CHART_PALETTE.length];
              return (
                <div key={slice.label} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-white/85 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: color }}
                      />
                      <span className="truncate" title={slice.label}>
                        {slice.label}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-white/70 flex-shrink-0">
                      {slice.count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden mt-0.5">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface FieldDashboardProps {
  campaign: Campaign;
  campaignSlug: string;
  authToken?: string;
  onUpdateCampaign?: (updated: Campaign) => void;
}

export default function FieldDashboard({
  campaign,
  campaignSlug,
  authToken,
  onUpdateCampaign,
}: FieldDashboardProps) {
  const todayStr = useMemo(() => getLagosTodayStr(), []);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [baFilter, setBaFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "flagged" | "absent">(
    "all"
  );
  const [dashboardTab, setDashboardTab] = useState<
    "attendance" | "calendar" | "photos" | "surveys" | "analytics"
  >("attendance");
  const [showFleetMap, setShowFleetMap] = useState(true);

  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [surveys, setSurveys] = useState<SurveyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [reviewingId, setReviewingId] = useState<string>("");
  const [error, setError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Column visibility toggle for Submitted Reports (Akida Show/Hide Columns parity)
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Record<string, boolean>>({});

  // Interactive right-hand slicers for Visual Analytics tab (Akida Power BI slicer parity)
  const [analyticsSelectedBas, setAnalyticsSelectedBas] = useState<string[]>([]);
  const [analyticsSelectedStores, setAnalyticsSelectedStores] = useState<string[]>([]);
  const [analyticsSelectedStates, setAnalyticsSelectedStates] = useState<string[]>([]);

  // Side-by-Side Attendance Details Modal (Akida 15:58 parity: Photo + Map + Shift metadata)
  const [inspectingItem, setInspectingItem] = useState<{
    store: StoreLocation;
    checkIn: CheckInRecord;
  } | null>(null);

  const [stores, setStores] = useState<StoreLocation[]>(campaign.stores || []);

  useEffect(() => {
    if (campaign.stores) {
      setStores(campaign.stores);
    }
  }, [campaign.stores]);

  function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    return headers;
  }

  async function handleSeedStores() {
    if (!confirm("Seed realistic Nigerian retail stores with pre-configured GPS geofences?"))
      return;
    setSeeding(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: "seed_demo_stores",
          campaignId: campaignSlug,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert("Failed to seed demo stores: " + (data.error || "Unauthorized"));
        return;
      }
      const seeded: StoreLocation[] = data.stores || [];
      setStores(seeded);
      if (onUpdateCampaign) {
        onUpdateCampaign({ ...campaign, stores: seeded });
      }
      alert("Successfully seeded demo stores with GPS geofence coordinates!");
    } catch (err: any) {
      alert("Failed to seed demo stores: " + err.message);
    } finally {
      setSeeding(false);
    }
  }

  async function handleReviewCheckIn(checkInId: string, decision: "approved" | "rejected") {
    const note =
      decision === "rejected"
        ? prompt("Optional reason for rejecting this check-in:", "Outside store perimeter") ||
          undefined
        : "Approved by supervisor";
    setReviewingId(checkInId);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: "review_checkin",
          campaignId: campaignSlug,
          checkInId,
          decision,
          reviewNote: note,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.checkIn) {
        setRecords((prev) => prev.map((r) => (r.id === checkInId ? data.checkIn : r)));
        if (inspectingItem?.checkIn.id === checkInId) {
          setInspectingItem({ store: inspectingItem.store, checkIn: data.checkIn });
        }
      } else {
        alert(data.error || "Could not update review status.");
      }
    } catch {
      alert("Network error while reviewing check-in.");
    } finally {
      setReviewingId("");
    }
  }

  // Fetch check-ins & surveys for selected date or date range
  async function fetchCheckIns() {
    setLoading(true);
    setError("");
    try {
      const minD = startDate <= endDate ? startDate : endDate;
      const maxD = startDate <= endDate ? endDate : startDate;
      const res = await fetch(
        `/api/checkin?campaignId=${encodeURIComponent(
          campaignSlug
        )}&date=${encodeURIComponent(minD)}&startDate=${encodeURIComponent(
          minD
        )}&endDate=${encodeURIComponent(maxD)}`,
        { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setRecords(data.records || []);
        setSurveys(data.surveys || []);
      } else {
        setError(data.error || "Failed to load check-ins.");
      }
    } catch (err: any) {
      console.error("Fetch checkins error:", err);
      setError("Network error. Could not load records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCheckIns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignSlug, startDate, endDate]);

  // Distinct BA names across stores, check-ins, and surveys
  const allBaNames = useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) if (s.baName?.trim()) set.add(s.baName.trim());
    for (const r of records) if (r.baName?.trim()) set.add(r.baName.trim());
    for (const sv of surveys) if (sv.baName?.trim()) set.add(sv.baName.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [stores, records, surveys]);

  // Map stores against their latest check-in record in the selected range
  const combinedStoreRecords: CombinedStoreAttendance[] = useMemo(() => {
    const recordMap = new Map<string, CheckInRecord>();
    for (const r of records) {
      const codeKey = (r.storeCode || "").trim().toLowerCase();
      if (!recordMap.has(codeKey)) {
        recordMap.set(codeKey, r);
      }
    }

    return stores.map((s) => {
      const sCode = (s.storeCode || (s as any).code || s.id || "").trim().toLowerCase();
      const rec = recordMap.get(sCode) || null;
      return {
        store: s,
        checkIn: rec,
      };
    });
  }, [stores, records]);

  // Filtered rows for Attendance table & Fleet Map
  const filteredRows = useMemo(() => {
    return combinedStoreRecords.filter(({ store, checkIn }) => {
      const q = searchQuery.toLowerCase().trim();
      const sCode = (store.storeCode || (store as any).code || store.id || "").toLowerCase();
      const sAddr = (store.address || (store as any).city || "").toLowerCase();
      const effectiveBa = (checkIn?.baName || store.baName || "").toLowerCase();
      const matchesSearch =
        !q ||
        store.name.toLowerCase().includes(q) ||
        sCode.includes(q) ||
        sAddr.includes(q) ||
        effectiveBa.includes(q) ||
        (checkIn?.baPhone && checkIn.baPhone.includes(q));

      const matchesState =
        stateFilter === "all" ||
        (store.state && store.state.toLowerCase() === stateFilter.toLowerCase());

      const matchesBa =
        baFilter === "all" ||
        effectiveBa === baFilter.toLowerCase();

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "absent" && !checkIn) ||
        (statusFilter === "verified" &&
          (checkIn?.status === "verified" || checkIn?.status === "checked_out")) ||
        (statusFilter === "flagged" &&
          (checkIn?.status === "flagged" || checkIn?.status === "rejected"));

      return matchesSearch && matchesState && matchesBa && matchesStatus;
    });
  }, [combinedStoreRecords, searchQuery, stateFilter, baFilter, statusFilter]);

  // Metrics
  const totalStores = stores.length;
  const verifiedCount = combinedStoreRecords.filter(
    (r) => r.checkIn?.status === "verified" || r.checkIn?.status === "checked_out"
  ).length;
  const flaggedCount = combinedStoreRecords.filter(
    (r) => r.checkIn?.status === "flagged"
  ).length;
  const absentCount = combinedStoreRecords.filter((r) => !r.checkIn).length;
  const totalSamples = records.reduce((acc, r) => acc + (r.samplesLogged || 0), 0);

  // Active dynamic survey questions for Submitted Reports & Visual Analytics
  const activeSurveyQuestions: SurveyQuestion[] = useMemo(() => {
    if (campaign.surveyQuestions && campaign.surveyQuestions.length > 0) {
      return campaign.surveyQuestions;
    }
    const hasHospitalSurvey =
      campaign.activationType === "hospital" ||
      surveys.some((s) => s.surveyType === "hospital");
    if (hasHospitalSurvey) {
      return DEFAULT_HOSPITAL_QUESTIONS;
    }
    return [];
  }, [campaign.surveyQuestions, campaign.activationType, surveys]);

  // Helper to resolve a survey's answer for a dynamic question column
  function getSurveyQuestionAnswer(s: SurveyRecord, q: SurveyQuestion): string {
    if (s.surveyAnswers && s.surveyAnswers[q.id] !== undefined && s.surveyAnswers[q.id] !== "") {
      return String(s.surveyAnswers[q.id]);
    }
    const idLow = q.id.toLowerCase();
    if (idLow.includes("mother_name") || (idLow.includes("name") && !idLow.includes("hospital"))) {
      return s.respondentName || "—";
    }
    if (q.type === "tel" || idLow.includes("phone")) {
      return s.respondentPhone || "—";
    }
    if (idLow.includes("clinic")) {
      return s.clinicType || "—";
    }
    if (q.autoFillStoreName || idLow.includes("hospital")) {
      return s.hospitalName || s.storeName || "—";
    }
    if (q.type === "radio_consent" || idLow.includes("consent")) {
      if (s.marketingConsentLabel) return s.marketingConsentLabel;
      if (typeof s.marketingConsent === "boolean") {
        return s.marketingConsent ? "Yes (Consented)" : "No (Opted Out)";
      }
      return "—";
    }
    return "—";
  }

  const escapeCsvCell = (val: unknown): string => {
    let str = String(val ?? "");
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  // ── CSV Export for Client Invoicing (Timesheet) ──
  function handleExportCSV() {
    if (!combinedStoreRecords.length) return;

    const headers = [
      "Store Code",
      "Store Name",
      "City",
      "State",
      "BA Name",
      "BA Phone",
      "Date Range",
      "Check-In Time",
      "Check-Out Time",
      "Hours Worked",
      "GPS Distance (Meters)",
      "Geofence Status",
      "Samples Logged",
      "Has Photo Proof",
    ];

    const dateLabel = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;

    const rows = combinedStoreRecords.map(({ store, checkIn }) => {
      const inTime = checkIn?.checkInTime
        ? new Date(checkIn.checkInTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "N/A";
      const outTime = checkIn?.checkOutTime
        ? new Date(checkIn.checkOutTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "N/A";
      const statusText = !checkIn
        ? "ABSENT / NO SHOW"
        : checkIn.status === "verified"
        ? "VERIFIED ON-SITE"
        : checkIn.status === "checked_out"
        ? "SHIFT COMPLETED (VERIFIED)"
        : checkIn.status === "rejected"
        ? "REJECTED BY SUPERVISOR"
        : "FLAGGED (OUTSIDE GEOFENCE)";

      return [
        escapeCsvCell(store.storeCode || (store as any).code || store.id || ""),
        escapeCsvCell(store.name || ""),
        escapeCsvCell(store.address || (store as any).city || ""),
        escapeCsvCell(store.state || ""),
        escapeCsvCell(checkIn?.baName || store.baName || "N/A"),
        escapeCsvCell(checkIn?.baPhone || store.baPhone || "N/A"),
        escapeCsvCell(checkIn?.shiftDate || dateLabel),
        escapeCsvCell(inTime),
        escapeCsvCell(outTime),
        escapeCsvCell(checkIn?.hoursWorked ?? "0"),
        escapeCsvCell(checkIn?.distanceMeters ?? "N/A"),
        escapeCsvCell(statusText),
        escapeCsvCell(checkIn?.samplesLogged ?? 0),
        escapeCsvCell(checkIn?.photoUrl ? "YES" : "NO"),
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Field_Timesheet_${campaignSlug}_${dateLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ── Monthly / Date-Range Attendance Matrix Data & CSV Export (Akida Calendar Matrix parity) ──
  const dateColumns = useMemo(
    () => enumerateDatesBetween(startDate, endDate, 31),
    [startDate, endDate]
  );

  const matrixRows = useMemo(() => {
    const byStoreAndDate = new Map<string, CheckInRecord>();
    for (const r of records) {
      const code = (r.storeCode || "").trim().toLowerCase();
      byStoreAndDate.set(`${code}__${r.shiftDate}`, r);
    }

    return stores
      .filter((s) => {
        if (stateFilter !== "all" && s.state?.toLowerCase() !== stateFilter.toLowerCase()) {
          return false;
        }
        if (baFilter !== "all" && (s.baName || "").toLowerCase() !== baFilter.toLowerCase()) {
          return false;
        }
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          (s.storeCode || s.id || "").toLowerCase().includes(q) ||
          (s.baName || "").toLowerCase().includes(q)
        );
      })
      .map((store) => {
        const code = (store.storeCode || (store as any).code || store.id || "")
          .trim()
          .toLowerCase();
        let daysWorked = 0;
        let daysFlagged = 0;
        let totalHours = 0;
        let totalSamplesForStore = 0;
        let latestBaName = store.baName || "Unassigned";

        const perDate: Record<string, CheckInRecord | null> = {};
        for (const d of dateColumns) {
          const rec = byStoreAndDate.get(`${code}__${d}`) || null;
          perDate[d] = rec;
          if (rec) {
            if (rec.baName) latestBaName = rec.baName;
            if (rec.status === "verified" || rec.status === "checked_out") {
              daysWorked++;
            } else if (rec.status === "flagged") {
              daysFlagged++;
            }
            totalHours += Number(rec.hoursWorked || 0);
            totalSamplesForStore += Number(rec.samplesLogged || 0);
          }
        }

        const daysAbsent = Math.max(0, dateColumns.length - (daysWorked + daysFlagged));
        return {
          store,
          code,
          baName: latestBaName,
          perDate,
          daysWorked,
          daysFlagged,
          daysAbsent,
          totalHours: Math.round(totalHours * 10) / 10,
          totalSamplesForStore,
        };
      });
  }, [stores, records, dateColumns, stateFilter, baFilter, searchQuery]);

  function handleExportMatrixCSV() {
    if (!matrixRows.length) return;
    const headers = [
      "Store Code",
      "Venue Name",
      "State",
      "BA Staff Name",
      ...dateColumns,
      "Days Worked",
      "Days Flagged",
      "Days Absent",
      "Total Hours",
      "Total Samples",
    ];
    const rows = matrixRows.map((row) => [
      escapeCsvCell(row.code),
      escapeCsvCell(row.store.name),
      escapeCsvCell(row.store.state || ""),
      escapeCsvCell(row.baName),
      ...dateColumns.map((d) => {
        const rec = row.perDate[d];
        if (!rec) return escapeCsvCell(0);
        if (rec.status === "verified" || rec.status === "checked_out") return escapeCsvCell(1);
        return escapeCsvCell("FLAGGED");
      }),
      escapeCsvCell(row.daysWorked),
      escapeCsvCell(row.daysFlagged),
      escapeCsvCell(row.daysAbsent),
      escapeCsvCell(row.totalHours),
      escapeCsvCell(row.totalSamplesForStore),
    ]);
    const dateLabel = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
    const csvContent =
      "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Attendance_Matrix_${campaignSlug}_${dateLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Filtered surveys for Submitted Reports tab
  const filteredSurveys = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return surveys.filter((s) => {
      if (baFilter !== "all" && s.baName.toLowerCase() !== baFilter.toLowerCase()) {
        return false;
      }
      if (stateFilter !== "all") {
        const matchedStore = stores.find(
          (st) =>
            (st.storeCode || st.id || "").toLowerCase() === (s.storeCode || "").toLowerCase()
        );
        if (matchedStore?.state?.toLowerCase() !== stateFilter.toLowerCase()) {
          return false;
        }
      }
      if (!q) return true;
      return (
        s.respondentName.toLowerCase().includes(q) ||
        (s.respondentPhone && s.respondentPhone.includes(q)) ||
        s.storeName.toLowerCase().includes(q) ||
        s.storeCode.toLowerCase().includes(q) ||
        s.baName.toLowerCase().includes(q)
      );
    });
  }, [surveys, searchQuery, baFilter, stateFilter, stores]);

  // ── CSV Export for Submitted Reports (With Dynamic Question Columns!) ──
  function handleExportSurveysCSV() {
    if (!filteredSurveys.length) return;

    const dynamicHeaders =
      activeSurveyQuestions.length > 0
        ? activeSurveyQuestions.map((q) => q.label)
        : ["Respondent Name", "Respondent Phone", "Product / Stage", "Feedback / Kit", "Conversion / Brand"];

    const headers = [
      "Respondent ID",
      "Field Officer (BA)",
      "Store Code",
      "Venue Name",
      "Date",
      "Time",
      "Latitude",
      "Longitude",
      ...dynamicHeaders,
      "Notes",
    ];

    const rows = filteredSurveys.map((s) => {
      const timeStr = s.createdAt
        ? new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "N/A";

      const dynamicCols =
        activeSurveyQuestions.length > 0
          ? activeSurveyQuestions.map((q) => escapeCsvCell(getSurveyQuestionAnswer(s, q)))
          : [
              escapeCsvCell(s.respondentName),
              escapeCsvCell(s.respondentPhone || "N/A"),
              escapeCsvCell(
                s.surveyType === "hospital"
                  ? s.clinicType || s.motherStage || "N/A"
                  : s.productSampled || "N/A"
              ),
              escapeCsvCell(
                s.surveyType === "hospital"
                  ? typeof s.marketingConsent === "boolean"
                    ? s.marketingConsent
                      ? "Consent: YES"
                      : "Consent: NO"
                    : s.diaperSizeIssued || "N/A"
                  : s.tasteFeedback || "N/A"
              ),
              escapeCsvCell(
                s.surveyType === "hospital"
                  ? s.currentBrandUsed || "N/A"
                  : s.purchasedOnShelf
                  ? `YES (${s.packsPurchased || 1})`
                  : "NO"
              ),
            ];

      return [
        escapeCsvCell(s.id),
        escapeCsvCell(s.baName),
        escapeCsvCell(s.storeCode),
        escapeCsvCell(s.storeName),
        escapeCsvCell(s.shiftDate || startDate),
        escapeCsvCell(timeStr),
        escapeCsvCell(s.lat ?? "N/A"),
        escapeCsvCell(s.lng ?? "N/A"),
        ...dynamicCols,
        escapeCsvCell(s.notes || ""),
      ].join(",");
    });

    const dateLabel = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Field_Surveys_${campaignSlug}_${dateLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleCopySurveysToClipboard() {
    if (!filteredSurveys.length) return;
    const dynamicHeaders =
      activeSurveyQuestions.length > 0
        ? activeSurveyQuestions.map((q) => q.label)
        : ["Respondent", "Phone", "Stage/Product", "Consent/Feedback"];
    const headerLine = ["RespondentID", "FieldOfficer", "Store", "Date", ...dynamicHeaders].join(
      "\t"
    );
    const lines = filteredSurveys.map((s) => {
      const cols =
        activeSurveyQuestions.length > 0
          ? activeSurveyQuestions.map((q) => getSurveyQuestionAnswer(s, q))
          : [
              s.respondentName,
              s.respondentPhone || "",
              s.clinicType || s.productSampled || "",
              typeof s.marketingConsent === "boolean"
                ? s.marketingConsent
                  ? "YES"
                  : "NO"
                : s.tasteFeedback || "",
            ];
      return [s.id, s.baName, s.storeName, s.shiftDate, ...cols].join("\t");
    });
    navigator.clipboard?.writeText([headerLine, ...lines].join("\n"));
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }

  // ── Visual Analytics Slicer & Aggregation Engine (Akida Power BI Parity) ──
  const analyticsFilteredSurveys = useMemo(() => {
    return filteredSurveys.filter((s) => {
      if (
        analyticsSelectedBas.length > 0 &&
        !analyticsSelectedBas.includes(s.baName)
      ) {
        return false;
      }
      if (
        analyticsSelectedStores.length > 0 &&
        !analyticsSelectedStores.includes(s.storeName)
      ) {
        return false;
      }
      if (analyticsSelectedStates.length > 0) {
        const st = stores.find(
          (item) =>
            (item.storeCode || item.id || "").toLowerCase() === (s.storeCode || "").toLowerCase()
        );
        if (!st?.state || !analyticsSelectedStates.includes(st.state)) {
          return false;
        }
      }
      return true;
    });
  }, [
    filteredSurveys,
    analyticsSelectedBas,
    analyticsSelectedStores,
    analyticsSelectedStates,
    stores,
  ]);

  const analyticsCharts = useMemo(() => {
    const charts: Array<{
      id: string;
      title: string;
      subtitle: string;
      data: Array<{ label: string; count: number; color?: string }>;
    }> = [];

    // 1. Auto-generate chart for each select / checkbox / radio_consent question
    for (const q of activeSurveyQuestions) {
      if (q.type === "select" || q.type === "checkbox" || q.type === "radio_consent") {
        const counts = new Map<string, number>();
        for (const s of analyticsFilteredSurveys) {
          const raw = getSurveyQuestionAnswer(s, q);
          if (q.type === "checkbox") {
            const parts = raw
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p && p !== "—");
            for (const part of parts) {
              counts.set(part, (counts.get(part) || 0) + 1);
            }
          } else {
            let val = raw;
            if (q.type === "radio_consent") {
              val = val.toLowerCase().startsWith("yes") ? "Yes — Consented" : "No — Opted Out";
            }
            counts.set(val, (counts.get(val) || 0) + 1);
          }
        }
        const data = Array.from(counts.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count);
        charts.push({
          id: q.id,
          title: q.label,
          subtitle: "Response distribution",
          data,
        });
      }
    }

    // 2. Fallback / additional charts: Submissions by Venue/Hospital & Submissions by Field Officer (BA)
    const byStore = new Map<string, number>();
    const byBa = new Map<string, number>();
    for (const s of analyticsFilteredSurveys) {
      byStore.set(s.storeName || s.storeCode, (byStore.get(s.storeName || s.storeCode) || 0) + 1);
      byBa.set(s.baName || "BA", (byBa.get(s.baName || "BA") || 0) + 1);
    }

    charts.push({
      id: "_by_venue",
      title: "Submissions by Venue / Hospital",
      subtitle: "Share of respondents captured per location",
      data: Array.from(byStore.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    });

    charts.push({
      id: "_by_ba",
      title: "Submissions by Field Officer (BA)",
      subtitle: "Productivity breakdown by Brand Ambassador",
      data: Array.from(byBa.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    });

    return charts;
  }, [activeSurveyQuestions, analyticsFilteredSurveys]);

  function toggleSlicerItem(
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    val: string
  ) {
    setList((prev) => (prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]));
  }

  // All check-in records that include a selfie photo (for Audit Attendance Photos tab)
  const photoRecords = useMemo(() => {
    return records.filter((r) => {
      if (!r.photoUrl) return false;
      if (baFilter !== "all" && r.baName.toLowerCase() !== baFilter.toLowerCase()) return false;
      if (
        statusFilter === "verified" &&
        r.status !== "verified" &&
        r.status !== "checked_out"
      ) {
        return false;
      }
      if (statusFilter === "flagged" && r.status !== "flagged" && r.status !== "rejected") {
        return false;
      }
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        r.storeName.toLowerCase().includes(q) ||
        r.storeCode.toLowerCase().includes(q) ||
        r.baName.toLowerCase().includes(q)
      );
    });
  }, [records, baFilter, statusFilter, searchQuery]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Top Overview Filter Bar (Akida Today's Overview Parity: Lower Date, Upper Date, User Name, Presets) ── */}
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-black uppercase tracking-wider text-teal-400 mr-1">
              Overview Filter:
            </span>
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-white/10 rounded-xl px-2.5 py-1.5">
              <span className="text-[10px] uppercase font-bold text-white/40">From</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setStartDate(val);
                  if (val > endDate) setEndDate(val);
                }}
                className="text-xs font-mono text-white bg-transparent focus:outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-white/10 rounded-xl px-2.5 py-1.5">
              <span className="text-[10px] uppercase font-bold text-white/40">To</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setEndDate(val);
                  if (val < startDate) setStartDate(val);
                }}
                className="text-xs font-mono text-white bg-transparent focus:outline-none cursor-pointer"
              />
            </div>

            {/* Quick Date Presets */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setStartDate(todayStr);
                  setEndDate(todayStr);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                  startDate === todayStr && endDate === todayStr
                    ? "bg-teal-500/20 text-teal-300 border-teal-500/40"
                    : "bg-white/5 text-white/60 border-white/10 hover:text-white"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartDate(shiftDateByDays(todayStr, -6));
                  setEndDate(todayStr);
                }}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition cursor-pointer"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartDate(getMonthStartStr(todayStr));
                  setEndDate(todayStr);
                }}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition cursor-pointer"
              >
                This Month
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* BA / User Name Dropdown */}
            <select
              value={baFilter}
              onChange={(e) => setBaFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs text-white bg-slate-900 border border-white/10 focus:border-teal-400 focus:outline-none cursor-pointer"
            >
              <option value="all">All Field Officers (BAs)</option>
              {allBaNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            {/* State Filter */}
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs text-white bg-slate-900 border border-white/10 focus:border-teal-400 focus:outline-none cursor-pointer"
            >
              <option value="all">All States</option>
              {NIGERIAN_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={loading}
              onClick={fetchCheckIns}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-black bg-teal-400 hover:bg-teal-300 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Load Statistics</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Top Clickable Metric Cards (Akida Click-to-Filter Parity) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <button
          type="button"
          onClick={() => {
            setStatusFilter("all");
            setDashboardTab("attendance");
          }}
          className={`text-left p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === "all" && dashboardTab === "attendance"
              ? "bg-white/[0.07] border-white/30"
              : "bg-white/[0.03] border-white/10 hover:bg-white/[0.05]"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">
            Total Locations
          </p>
          <p className="text-2xl font-black text-white mt-1 font-mono">{totalStores}</p>
          <span className="text-[10px] text-white/50">Click to view all venues</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter("verified");
            setDashboardTab("attendance");
          }}
          className={`text-left p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === "verified"
              ? "bg-emerald-500/20 border-emerald-400"
              : "bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/15"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
            Users Worked (Verified)
          </p>
          <p className="text-2xl font-black text-emerald-400 mt-1 font-mono">{verifiedCount}</p>
          <span className="text-[10px] text-emerald-300/60">
            {totalStores > 0 ? `${Math.round((verifiedCount / totalStores) * 100)}% compliance` : "0%"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter("flagged");
            setDashboardTab("attendance");
          }}
          className={`text-left p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === "flagged"
              ? "bg-amber-500/20 border-amber-400"
              : "bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/15"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
            Outside Geofence
          </p>
          <p className="text-2xl font-black text-amber-400 mt-1 font-mono">{flaggedCount}</p>
          <span className="text-[10px] text-amber-300/60">Click to review flagged</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter("absent");
            setDashboardTab("attendance");
          }}
          className={`text-left p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === "absent"
              ? "bg-red-500/20 border-red-400"
              : "bg-red-500/10 border-red-500/25 hover:bg-red-500/15"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-300">
            Users Absent
          </p>
          <p className="text-2xl font-black text-red-400 mt-1 font-mono">{absentCount}</p>
          <span className="text-[10px] text-red-300/60">Click to view users absent</span>
        </button>

        <button
          type="button"
          onClick={() => setDashboardTab("analytics")}
          className={`text-left p-4 rounded-2xl border col-span-2 sm:col-span-1 transition cursor-pointer ${
            dashboardTab === "analytics" || dashboardTab === "surveys"
              ? "bg-teal-500/20 border-teal-400"
              : "bg-teal-500/10 border-teal-500/25 hover:bg-teal-500/15"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-300">
            Reports Received
          </p>
          <p className="text-2xl font-black text-teal-400 mt-1 font-mono">
            {surveys.length}{" "}
            <span className="text-sm text-white/50 font-normal">/ {totalSamples}</span>
          </p>
          <span className="text-[10px] text-teal-300/60">Click for Visual Analytics →</span>
        </button>
      </div>

      {/* ── Primary 5-View Navigation Bar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-900/80 p-1.5 rounded-2xl border border-white/10">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setDashboardTab("attendance")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              dashboardTab === "attendance"
                ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Daily Logs & Live Map ({verifiedCount}/{totalStores})</span>
          </button>

          <button
            type="button"
            onClick={() => setDashboardTab("calendar")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              dashboardTab === "calendar"
                ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Attendance Calendar Matrix</span>
          </button>

          <button
            type="button"
            onClick={() => setDashboardTab("photos")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              dashboardTab === "photos"
                ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Audit Attendance Photos ({photoRecords.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setDashboardTab("surveys")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              dashboardTab === "surveys"
                ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Submitted Reports ({filteredSurveys.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setDashboardTab("analytics")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              dashboardTab === "analytics"
                ? "bg-gradient-to-r from-amber-400 to-orange-400 text-black shadow-md shadow-amber-500/20"
                : "text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>View Analytics</span>
          </button>
        </div>

        {/* Context Action Buttons */}
        <div className="flex items-center gap-2">
          {dashboardTab === "attendance" && (
            <>
              <button
                type="button"
                onClick={() => setShowFleetMap((v) => !v)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                  showFleetMap
                    ? "bg-teal-500/15 text-teal-300 border-teal-500/35"
                    : "bg-white/5 text-white/60 border-white/10 hover:text-white"
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>{showFleetMap ? "Hide Map" : "Show Live Map"}</span>
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3.5 py-2 rounded-xl text-xs font-black text-black bg-teal-400 hover:bg-teal-300 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Timesheet (CSV)</span>
              </button>
            </>
          )}

          {dashboardTab === "calendar" && (
            <button
              type="button"
              onClick={handleExportMatrixCSV}
              className="px-3.5 py-2 rounded-xl text-xs font-black text-black bg-emerald-400 hover:bg-emerald-300 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Payroll Matrix (CSV)</span>
            </button>
          )}

          {(dashboardTab === "surveys" || dashboardTab === "analytics") && (
            <button
              type="button"
              disabled={!filteredSurveys.length}
              onClick={handleExportSurveysCSV}
              className="px-3.5 py-2 rounded-xl text-xs font-black text-black bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Reports (CSV)</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Search & Status Filter Strip ── */}
      <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            placeholder="Search store name, code, BA name, respondent name, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs text-white bg-white/5 border border-white/10 focus:border-teal-400 focus:outline-none"
          />
        </div>

        {dashboardTab === "attendance" && (
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "all"
                  ? "bg-white/20 text-white"
                  : "text-white/40 hover:text-white"
              }`}
            >
              All ({totalStores})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("verified")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "verified"
                  ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/40"
                  : "text-white/40 hover:text-emerald-300"
              }`}
            >
              ● Verified ({verifiedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("flagged")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "flagged"
                  ? "bg-amber-500/25 text-amber-300 border border-amber-500/40"
                  : "text-white/40 hover:text-amber-300"
              }`}
            >
              ▲ Flagged ({flaggedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("absent")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === "absent"
                  ? "bg-red-500/25 text-red-300 border border-red-500/40"
                  : "text-white/40 hover:text-red-300"
              }`}
            >
              ○ Absent ({absentCount})
            </button>
            {stores.length === 0 && (
              <button
                type="button"
                disabled={loading || seeding}
                onClick={handleSeedStores}
                className="px-3 py-1.5 rounded-xl text-xs font-black text-slate-900 bg-gradient-to-r from-emerald-400 to-teal-400 flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Seed Demo Stores</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 1: ATTENDANCE DAILY LOGS + LIVE USER LOCATIONS MAP
         ══════════════════════════════════════════════════════════════════════════ */}
      {dashboardTab === "attendance" && (
        <div className="space-y-5">
          {showFleetMap && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-teal-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-white">
                    User Locations — Live Geofence & Field Staff Radar
                  </h3>
                </div>
                <span className="text-[11px] text-white/45">
                  Click any venue or BA pin to inspect attendance photo & location
                </span>
              </div>
              <FleetOverviewMap
                items={filteredRows}
                onSelectRecord={(item) => {
                  if (item.checkIn) {
                    setInspectingItem({ store: item.store, checkIn: item.checkIn });
                  }
                }}
                className="h-80 sm:h-96 w-full"
              />
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-xs text-white/40 flex flex-col items-center justify-center gap-2 font-mono">
                <span className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                <span>Loading field attendance records...</span>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-14 text-center text-xs text-white/40">
                No store attendance records match the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-white/50 text-[10px] uppercase font-mono tracking-wider">
                      <th className="py-3 px-4">Store Location</th>
                      <th className="py-3 px-3">State / Address</th>
                      <th className="py-3 px-3">BA Staff</th>
                      <th className="py-3 px-3">Arrival / Shift</th>
                      <th className="py-3 px-3">GPS Distance</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-center">Samples</th>
                      <th className="py-3 px-4 text-center">View Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredRows.map(({ store, checkIn }) => {
                      const hasRecord = Boolean(checkIn);
                      const isVerified =
                        checkIn?.status === "verified" || checkIn?.status === "checked_out";
                      const isFlagged = checkIn?.status === "flagged";
                      const arrivalTime = checkIn?.checkInTime
                        ? new Date(checkIn.checkInTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : null;

                      return (
                        <tr
                          key={store.id || store.storeCode || (store as any).code}
                          className="hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-white">{store.name}</div>
                            <div className="font-mono text-[10px] text-teal-400 mt-0.5">
                              {store.storeCode || (store as any).code || "NO-CODE"}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <div className="text-white/80 text-xs line-clamp-1">
                              {store.address || (store as any).city || "—"}
                            </div>
                            {store.state && (
                              <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25 mt-0.5">
                                {store.state}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            {hasRecord ? (
                              <div>
                                <div className="font-semibold text-white">{checkIn!.baName}</div>
                                {checkIn!.baPhone && (
                                  <div className="font-mono text-[10px] text-white/50 mt-0.5">
                                    {checkIn!.baPhone}
                                  </div>
                                )}
                              </div>
                            ) : store.baName ? (
                              <div>
                                <div className="font-medium text-white/60">{store.baName}</div>
                                <div className="text-[10px] text-red-400/80">Not checked in</div>
                              </div>
                            ) : (
                              <span className="text-white/30 italic">Unassigned / Pending</span>
                            )}
                          </td>

                          <td className="py-3 px-3 font-mono text-[11px]">
                            {arrivalTime ? (
                              <div className="space-y-0.5">
                                <div className="text-white flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-teal-400" />
                                  <span>{arrivalTime}</span>
                                  {startDate !== endDate && checkIn?.shiftDate && (
                                    <span className="text-[10px] text-white/40">
                                      ({checkIn.shiftDate})
                                    </span>
                                  )}
                                </div>
                                {checkIn?.checkOutTime ? (
                                  <div className="text-[10px] text-white/50">
                                    Out:{" "}
                                    {new Date(checkIn.checkOutTime).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                    {checkIn.hoursWorked ? ` (${checkIn.hoursWorked}h)` : ""}
                                  </div>
                                ) : checkIn?.inFencePingCount ? (
                                  <div className="text-[10px] text-teal-400/80">
                                    {checkIn.inFencePingCount} presence ping(s)
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-white/30">—</span>
                            )}
                          </td>

                          <td className="py-3 px-3 font-mono text-[11px]">
                            {hasRecord ? (
                              <div>
                                <span
                                  className={
                                    isVerified
                                      ? "text-emerald-300 font-bold"
                                      : "text-amber-400 font-bold"
                                  }
                                >
                                  {formatDistance(checkIn!.distanceMeters)}
                                </span>
                                {typeof checkIn?.checkInAccuracy === "number" && (
                                  <span className="text-[10px] text-white/40 ml-1">
                                    ±{checkIn.checkInAccuracy}m
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-white/30">—</span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            {isVerified ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                ● {checkIn?.status === "checked_out" ? "Checked Out" : "Verified"}
                              </span>
                            ) : isFlagged ? (
                              <div className="space-y-1">
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-block">
                                  ▲ Flagged Review
                                </span>
                                {checkIn?.spoofReasons && checkIn.spoofReasons.length > 0 && (
                                  <div
                                    className="text-[9px] text-amber-200/70 max-w-[160px] truncate"
                                    title={checkIn.spoofReasons.join(", ")}
                                  >
                                    {checkIn.spoofReasons[0]}
                                  </div>
                                )}
                                <div className="flex items-center gap-1 pt-0.5">
                                  <button
                                    type="button"
                                    disabled={reviewingId === checkIn!.id}
                                    onClick={() => handleReviewCheckIn(checkIn!.id, "approved")}
                                    className="px-1.5 py-0.5 rounded bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 text-[9px] font-bold cursor-pointer"
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    type="button"
                                    disabled={reviewingId === checkIn!.id}
                                    onClick={() => handleReviewCheckIn(checkIn!.id, "rejected")}
                                    className="px-1.5 py-0.5 rounded bg-red-500/25 hover:bg-red-500/40 text-red-200 text-[9px] font-bold cursor-pointer"
                                  >
                                    ✕ Reject
                                  </button>
                                </div>
                              </div>
                            ) : checkIn?.status === "rejected" ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/25 text-red-300 border border-red-500/40">
                                ✕ Rejected
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/25">
                                ○ Absent
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-bold text-white">
                            {hasRecord ? (checkIn!.samplesLogged ?? 0) : "—"}
                          </td>

                          <td className="py-3 px-4 text-center">
                            {checkIn ? (
                              <button
                                type="button"
                                onClick={() => setInspectingItem({ store, checkIn })}
                                className="px-2.5 py-1.5 rounded-lg bg-teal-500/15 text-teal-300 hover:bg-teal-500/25 border border-teal-500/30 transition-all cursor-pointer inline-flex items-center gap-1 text-[10px] font-bold"
                                title="View Photo & Map Details"
                              >
                                <Eye className="w-3 h-3" />
                                <span>View</span>
                              </button>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 2: MONTHLY / DATE-RANGE ATTENDANCE MATRIX (Akida Calendar Tab Parity)
         ══════════════════════════════════════════════════════════════════════════ */}
      {dashboardTab === "calendar" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                Attendance & Payroll Matrix ({startDate} → {endDate})
              </h3>
              <p className="text-[11px] text-white/45 mt-0.5">
                Day-by-day presence breakdown (`1` = Verified, `!` = Flagged, `0` = Absent). Use
                &ldquo;This Month&rdquo; or &ldquo;Last 7 Days&rdquo; above to expand the matrix.
              </p>
            </div>
            <span className="text-[11px] font-mono text-teal-300">
              {dateColumns.length} day(s) in range
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-white/50 text-[10px] uppercase font-mono tracking-wider">
                  <th className="py-3 px-3">Store Code</th>
                  <th className="py-3 px-3">Venue</th>
                  <th className="py-3 px-3">Staff Name</th>
                  {dateColumns.map((d) => (
                    <th key={d} className="py-3 px-2 text-center">
                      {d.slice(5)}
                    </th>
                  ))}
                  <th className="py-3 px-3 text-center text-emerald-300">Days Worked</th>
                  <th className="py-3 px-3 text-center text-red-300">Days Absent</th>
                  <th className="py-3 px-3 text-center">Hours</th>
                  <th className="py-3 px-3 text-center text-teal-300">Samples</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {matrixRows.map((row) => (
                  <tr key={row.code} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 text-[11px] text-teal-400">{row.code}</td>
                    <td className="py-2.5 px-3 font-sans font-bold text-white">
                      {row.store.name}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-white/85">{row.baName}</td>
                    {dateColumns.map((d) => {
                      const rec = row.perDate[d];
                      const verified =
                        rec?.status === "verified" || rec?.status === "checked_out";
                      const flagged = rec?.status === "flagged";
                      return (
                        <td key={d} className="py-2.5 px-2 text-center">
                          {verified ? (
                            <button
                              type="button"
                              onClick={() => setInspectingItem({ store: row.store, checkIn: rec! })}
                              className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-bold text-[11px] cursor-pointer"
                              title={`Verified (${d}) — Click to inspect`}
                            >
                              1
                            </button>
                          ) : flagged ? (
                            <button
                              type="button"
                              onClick={() => setInspectingItem({ store: row.store, checkIn: rec! })}
                              className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/35 font-bold text-[11px] cursor-pointer"
                              title={`Flagged (${d}) — Click to inspect`}
                            >
                              !
                            </button>
                          ) : (
                            <span className="inline-block w-6 h-6 leading-6 rounded-md bg-white/[0.03] text-white/25 text-[11px]">
                              0
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3 text-center font-bold text-emerald-400">
                      {row.daysWorked}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-red-400">
                      {row.daysAbsent}
                    </td>
                    <td className="py-2.5 px-3 text-center text-white/80">{row.totalHours}h</td>
                    <td className="py-2.5 px-3 text-center font-bold text-teal-300">
                      {row.totalSamplesForStore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 3: AUDIT ATTENDANCE PHOTOS WALL (Akida Audit Attendance Photos Parity)
         ══════════════════════════════════════════════════════════════════════════ */}
      {dashboardTab === "photos" && (
        <div className="space-y-4">
          {photoRecords.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border border-white/10 bg-white/[0.02] text-xs text-white/40">
              No attendance selfie photos found for the selected date range and filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photoRecords.map((rec) => {
                const matchedStore =
                  stores.find(
                    (s) =>
                      (s.storeCode || s.id || "").toLowerCase() ===
                      (rec.storeCode || "").toLowerCase()
                  ) ||
                  ({
                    id: rec.storeCode,
                    storeCode: rec.storeCode,
                    name: rec.storeName,
                    lat: rec.targetLat,
                    lng: rec.targetLng,
                    geofenceRadius: 200,
                  } as StoreLocation);

                const isVerified = rec.status === "verified" || rec.status === "checked_out";
                const isFlagged = rec.status === "flagged";

                return (
                  <div
                    key={rec.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col justify-between group"
                  >
                    <div
                      className="relative h-56 bg-black cursor-pointer overflow-hidden"
                      onClick={() => setInspectingItem({ store: matchedStore, checkIn: rec })}
                    >
                      <img
                        src={rec.photoUrl}
                        alt={rec.baName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-black/75 backdrop-blur border border-white/15">
                        {isVerified ? (
                          <span className="text-emerald-300">● {rec.status}</span>
                        ) : isFlagged ? (
                          <span className="text-amber-300">▲ Flagged</span>
                        ) : (
                          <span className="text-red-300">✕ Rejected</span>
                        )}
                      </div>
                      <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/75 backdrop-blur text-white/90 border border-white/15">
                        {formatDistance(rec.distanceMeters)}
                      </div>
                    </div>

                    <div className="p-3.5 space-y-2">
                      <div>
                        <p className="font-bold text-xs text-white truncate">{rec.storeName}</p>
                        <p className="text-[11px] text-teal-300 font-semibold">{rec.baName}</p>
                        <p className="text-[10px] font-mono text-white/45 mt-0.5">
                          {rec.shiftDate} ·{" "}
                          {new Date(rec.checkInTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => setInspectingItem({ store: matchedStore, checkIn: rec })}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <MapPin className="w-3 h-3 text-teal-400" />
                          <span>Photo + Map</span>
                        </button>
                        {isFlagged && (
                          <>
                            <button
                              type="button"
                              disabled={reviewingId === rec.id}
                              onClick={() => handleReviewCheckIn(rec.id, "approved")}
                              className="py-1.5 px-2 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 text-[10px] font-bold cursor-pointer"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              disabled={reviewingId === rec.id}
                              onClick={() => handleReviewCheckIn(rec.id, "rejected")}
                              className="py-1.5 px-2 rounded-lg bg-red-500/25 hover:bg-red-500/40 text-red-200 text-[10px] font-bold cursor-pointer"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 4: SUBMITTED REPORTS (Dynamic Survey Question Columns + Toolbar)
         ══════════════════════════════════════════════════════════════════════════ */}
      {dashboardTab === "surveys" && (
        <div className="space-y-3">
          {/* Akida-Style Export & Column Toolbar (COPY | CSV | PRINT | SHOW/HIDE COLUMNS | VIEW ANALYTICS) */}
          <div className="flex items-center justify-between gap-2 flex-wrap px-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleCopySurveysToClipboard}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-white/80 flex items-center gap-1.5 cursor-pointer"
              >
                {copyFeedback ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copyFeedback ? "COPIED!" : "COPY"}</span>
              </button>

              <button
                type="button"
                onClick={handleExportSurveysCSV}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-white/80 flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>CSV / EXCEL</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-white/80 flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PRINT</span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColumnPicker((v) => !v)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-white/80 flex items-center gap-1.5 cursor-pointer"
                >
                  <Columns className="w-3.5 h-3.5 text-teal-400" />
                  <span>SHOW/HIDE COLUMNS</span>
                </button>
                {showColumnPicker && (
                  <div className="absolute left-0 mt-1.5 w-60 p-3 rounded-2xl bg-slate-900 border border-white/20 shadow-2xl z-30 space-y-1.5 text-xs">
                    <p className="text-[10px] font-bold uppercase text-white/40 mb-1">
                      Toggle Table Columns
                    </p>
                    {[
                      { id: "coords", label: "GPS Coordinates (Lat/Lng)" },
                      ...activeSurveyQuestions.map((q) => ({ id: q.id, label: q.label })),
                    ].map((col) => (
                      <label
                        key={col.id}
                        className="flex items-center gap-2 text-white/80 cursor-pointer py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={!hiddenColumns[col.id]}
                          onChange={() =>
                            setHiddenColumns((prev) => ({
                              ...prev,
                              [col.id]: !prev[col.id],
                            }))
                          }
                        />
                        <span className="truncate">{col.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDashboardTab("analytics")}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 text-black font-black text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>View Analytics</span>
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-xs text-white/40 flex flex-col items-center justify-center gap-2 font-mono">
                <span className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                <span>Loading submitted survey reports...</span>
              </div>
            ) : filteredSurveys.length === 0 ? (
              <div className="py-14 text-center text-xs text-white/40">
                No consumer surveys submitted for the selected date range and filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-white/50 text-[10px] uppercase font-mono tracking-wider">
                      <th className="py-3 px-3">Date / Time</th>
                      <th className="py-3 px-3">Field Officer</th>
                      <th className="py-3 px-3">Store / Venue</th>
                      {!hiddenColumns["coords"] && <th className="py-3 px-3">Latitude / Lng</th>}
                      {activeSurveyQuestions.length > 0 ? (
                        activeSurveyQuestions.map(
                          (q) =>
                            !hiddenColumns[q.id] && (
                              <th key={q.id} className="py-3 px-3 text-teal-300">
                                {q.label}
                              </th>
                            )
                        )
                      ) : (
                        <>
                          <th className="py-3 px-3">Respondent</th>
                          <th className="py-3 px-3">Product / Stage</th>
                          <th className="py-3 px-3">Feedback / Kit</th>
                          <th className="py-3 px-4">Conversion / Brand</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredSurveys.map((s) => (
                      <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-3 font-mono text-[11px] text-white/70">
                          <div>
                            {new Date(s.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                          <div className="text-[10px] text-white/40">{s.shiftDate}</div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-white/90">{s.baName}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-white">{s.storeName}</div>
                          <div className="font-mono text-[10px] text-teal-400">{s.storeCode}</div>
                        </td>
                        {!hiddenColumns["coords"] && (
                          <td className="py-3 px-3 font-mono text-[10px] text-white/55">
                            {typeof s.lat === "number" && typeof s.lng === "number"
                              ? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`
                              : "—"}
                          </td>
                        )}
                        {activeSurveyQuestions.length > 0 ? (
                          activeSurveyQuestions.map(
                            (q) =>
                              !hiddenColumns[q.id] && (
                                <td key={q.id} className="py-3 px-3 text-white/85">
                                  {getSurveyQuestionAnswer(s, q)}
                                </td>
                              )
                          )
                        ) : (
                          <>
                            <td className="py-3 px-3">
                              <div className="font-bold text-white">{s.respondentName}</div>
                              {s.respondentPhone && (
                                <div className="font-mono text-[10px] text-white/50">
                                  {s.respondentPhone}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-white/80">
                              {s.productSampled || s.clinicType || "—"}
                            </td>
                            <td className="py-3 px-3 text-white/80">
                              {s.tasteFeedback || s.diaperSizeIssued || "—"}
                            </td>
                            <td className="py-3 px-4 text-white/80">
                              {s.purchasedOnShelf
                                ? `Bought (${s.packsPurchased || 1})`
                                : s.currentBrandUsed || "Sampled only"}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 5: VISUAL ANALYTICS (Instant Native Charts + Right-Hand Slicers)
         ══════════════════════════════════════════════════════════════════════════ */}
      {dashboardTab === "analytics" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left KPI Summary Column (Akida Power BI Left Strip Parity) */}
          <div className="lg:col-span-2 space-y-3">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-[10px] font-bold uppercase text-white/45">Total Respondents</p>
              <p className="text-3xl font-black font-mono text-white mt-1">
                {analyticsFilteredSurveys.length}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-[10px] font-bold uppercase text-white/45">Locations Active</p>
              <p className="text-2xl font-black font-mono text-teal-400 mt-1">
                {new Set(analyticsFilteredSurveys.map((s) => s.storeCode)).size}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <p className="text-[10px] font-bold uppercase text-white/45">Field Officers</p>
              <p className="text-2xl font-black font-mono text-amber-300 mt-1">
                {new Set(analyticsFilteredSurveys.map((s) => s.baName)).size}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
              <p className="text-[10px] font-bold uppercase text-emerald-300">
                Consent / Conversion
              </p>
              <p className="text-2xl font-black font-mono text-emerald-400 mt-1">
                {analyticsFilteredSurveys.length > 0
                  ? `${Math.round(
                      (analyticsFilteredSurveys.filter(
                        (s) => s.marketingConsent === true || s.purchasedOnShelf === true
                      ).length /
                        analyticsFilteredSurveys.length) *
                        100
                    )}%`
                  : "0%"}
              </p>
              <span className="text-[10px] text-emerald-300/60">Opt-in / purchase rate</span>
            </div>
          </div>

          {/* Center Donut & Distribution Charts Grid */}
          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-4">
            {analyticsCharts.map((c) => (
              <DonutBreakdownChart
                key={c.id}
                title={c.title}
                subtitle={c.subtitle}
                data={c.data}
              />
            ))}
          </div>

          {/* Right-Hand Interactive Slicer Panel (Akida Power BI Filter By Parity) */}
          <div className="lg:col-span-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4 h-fit">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Filter Analytics By
                </span>
              </div>
              {(analyticsSelectedBas.length > 0 ||
                analyticsSelectedStores.length > 0 ||
                analyticsSelectedStates.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setAnalyticsSelectedBas([]);
                    setAnalyticsSelectedStores([]);
                    setAnalyticsSelectedStates([]);
                  }}
                  className="text-[10px] font-bold text-amber-300 hover:underline cursor-pointer"
                >
                  Reset All
                </button>
              )}
            </div>

            {/* Slicer 1: Field Officer (BA) */}
            <div>
              <p className="text-[10px] font-bold uppercase text-white/45 mb-1.5">
                Field Officer (BA)
              </p>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {allBaNames.map((name) => (
                  <label
                    key={name}
                    className="flex items-center gap-2 text-xs text-white/80 cursor-pointer hover:text-white"
                  >
                    <input
                      type="checkbox"
                      checked={analyticsSelectedBas.includes(name)}
                      onChange={() =>
                        toggleSlicerItem(analyticsSelectedBas, setAnalyticsSelectedBas, name)
                      }
                    />
                    <span className="truncate">{name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Slicer 2: Venue / Hospital */}
            <div className="pt-2 border-t border-white/10">
              <p className="text-[10px] font-bold uppercase text-white/45 mb-1.5">
                Venue / Hospital
              </p>
              <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                {stores.map((st) => (
                  <label
                    key={st.id || st.storeCode}
                    className="flex items-center gap-2 text-xs text-white/80 cursor-pointer hover:text-white"
                  >
                    <input
                      type="checkbox"
                      checked={analyticsSelectedStores.includes(st.name)}
                      onChange={() =>
                        toggleSlicerItem(
                          analyticsSelectedStores,
                          setAnalyticsSelectedStores,
                          st.name
                        )
                      }
                    />
                    <span className="truncate">{st.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          AKIDA-STYLE SIDE-BY-SIDE ATTENDANCE DETAILS MODAL (Photo Left + Map Right)
         ══════════════════════════════════════════════════════════════════════════ */}
      {inspectingItem && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fadeIn"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(14px)" }}
          onClick={() => setInspectingItem(null)}
        >
          <div
            className="rounded-3xl p-5 max-w-4xl w-full bg-[#0b131e] border border-white/20 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-black text-sm text-white">
                    Attendance Details — {inspectingItem.store.name}
                  </p>
                  <p className="text-xs text-white/55">
                    Field Officer: <strong className="text-white">{inspectingItem.checkIn.baName}</strong>{" "}
                    · Date: <span className="font-mono">{inspectingItem.checkIn.shiftDate}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="p-1.5 rounded-full text-white/40 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Left Column: Attendance Selfie Photo + Verification Metadata */}
              <div className="md:col-span-5 space-y-3">
                <div className="rounded-2xl overflow-hidden border border-white/10 bg-black h-72 flex items-center justify-center">
                  {inspectingItem.checkIn.photoUrl ? (
                    <img
                      src={inspectingItem.checkIn.photoUrl}
                      alt="Attendance Proof"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-white/35 font-mono">NO IMAGE FOUND</span>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-white/45">Store Code:</span>
                    <span className="font-mono text-teal-300">{inspectingItem.checkIn.storeCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/45">Check-In Time:</span>
                    <span className="font-mono text-white">
                      {new Date(inspectingItem.checkIn.checkInTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  {inspectingItem.checkIn.checkOutTime && (
                    <div className="flex justify-between">
                      <span className="text-white/45">Check-Out Time:</span>
                      <span className="font-mono text-white">
                        {new Date(inspectingItem.checkIn.checkOutTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        ({inspectingItem.checkIn.hoursWorked || 0}h)
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-white/45">GPS Distance:</span>
                    <span className="font-mono font-bold text-emerald-300">
                      {formatDistance(inspectingItem.checkIn.distanceMeters)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/45">Coordinates:</span>
                    <span className="font-mono text-[11px] text-white/75">
                      {inspectingItem.checkIn.checkInLat?.toFixed(5)},{" "}
                      {inspectingItem.checkIn.checkInLng?.toFixed(5)}
                    </span>
                  </div>
                  {inspectingItem.checkIn.photoSha256 && (
                    <div className="flex justify-between">
                      <span className="text-white/45">Photo SHA-256:</span>
                      <span className="font-mono text-[10px] text-emerald-400">
                        {inspectingItem.checkIn.photoSha256.slice(0, 16)}…
                      </span>
                    </div>
                  )}
                </div>

                {inspectingItem.checkIn.status === "flagged" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={reviewingId === inspectingItem.checkIn.id}
                      onClick={() => handleReviewCheckIn(inspectingItem.checkIn.id, "approved")}
                      className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs cursor-pointer"
                    >
                      ✓ Approve Check-In
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === inspectingItem.checkIn.id}
                      onClick={() => handleReviewCheckIn(inspectingItem.checkIn.id, "rejected")}
                      className="flex-1 py-2 rounded-xl bg-red-500/25 hover:bg-red-500/40 text-red-200 border border-red-500/40 font-black text-xs cursor-pointer"
                    >
                      ✕ Reject
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Interactive Location Details Map (Target Geofence + BA Check-In Pin) */}
              <div className="md:col-span-7 flex flex-col">
                <GeofenceMap
                  targetLat={
                    isValidCoordinates(inspectingItem.store.lat, inspectingItem.store.lng)
                      ? inspectingItem.store.lat!
                      : inspectingItem.checkIn.targetLat
                  }
                  targetLng={
                    isValidCoordinates(inspectingItem.store.lat, inspectingItem.store.lng)
                      ? inspectingItem.store.lng!
                      : inspectingItem.checkIn.targetLng
                  }
                  radius={inspectingItem.store.geofenceRadius || 200}
                  polygon={inspectingItem.store.polygon}
                  targetLabel={inspectingItem.store.name}
                  userLat={inspectingItem.checkIn.checkInLat}
                  userLng={inspectingItem.checkIn.checkInLng}
                  accuracy={inspectingItem.checkIn.checkInAccuracy}
                  status={
                    inspectingItem.checkIn.status === "verified" ||
                    inspectingItem.checkIn.status === "checked_out"
                      ? "verified"
                      : inspectingItem.checkIn.status === "flagged"
                      ? "drift"
                      : "out_of_bounds"
                  }
                  className="h-80 md:h-full min-h-[340px] w-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
