"use client";

import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import type { StoreLocation, CheckInRecord } from "@/lib/types";
import { formatDistance, isValidCoordinates } from "@/lib/geo";

export interface CombinedStoreAttendance {
  store: StoreLocation;
  checkIn: CheckInRecord | null;
}

interface FleetOverviewMapProps {
  items: CombinedStoreAttendance[];
  onSelectRecord?: (item: CombinedStoreAttendance) => void;
  className?: string;
}

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function getItemColor(checkIn: CheckInRecord | null): string {
  if (!checkIn) return "#F87171"; // Absent -> Red
  if (checkIn.status === "verified" || checkIn.status === "checked_out") return "#34D399"; // Emerald
  if (checkIn.status === "flagged") return "#FBBF24"; // Amber
  return "#F87171"; // Rejected -> Red
}

function getItemLabel(checkIn: CheckInRecord | null): string {
  if (!checkIn) return "ABSENT / NO SHOW";
  if (checkIn.status === "checked_out") return "SHIFT COMPLETED";
  if (checkIn.status === "verified") return "VERIFIED ON-SITE";
  if (checkIn.status === "flagged") return "FLAGGED REVIEW";
  return "REJECTED";
}

export default function FleetOverviewMap({
  items,
  onSelectRecord,
  className = "",
}: FleetOverviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const tileLayerRef = useRef<Leaflet.TileLayer | null>(null);
  const groupRef = useRef<Leaflet.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [tileMode, setTileMode] = useState<"map" | "satellite">("map");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
      }).setView([6.5244, 3.3792], 11);

      tileLayerRef.current = L.tileLayer(TILE_URL, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      map.attributionControl.setPrefix(false);
      groupRef.current = L.layerGroup().addTo(map);

      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      groupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    tileLayerRef.current?.remove();
    tileLayerRef.current = L.tileLayer(
      tileMode === "satellite" ? SATELLITE_TILE_URL : TILE_URL,
      {
        maxZoom: 19,
        attribution:
          tileMode === "satellite"
            ? "Tiles &copy; Esri"
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }
    ).addTo(map);
  }, [ready, tileMode]);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!ready || !L || !map || !group) return;

    group.clearLayers();
    const boundsPoints: [number, number][] = [];

    for (const item of items) {
      const { store, checkIn } = item;
      const storeLat = isValidCoordinates(store.lat, store.lng)
        ? store.lat!
        : checkIn && isValidCoordinates(checkIn.targetLat, checkIn.targetLng)
        ? checkIn.targetLat
        : NaN;
      const storeLng = isValidCoordinates(store.lat, store.lng)
        ? store.lng!
        : checkIn && isValidCoordinates(checkIn.targetLat, checkIn.targetLng)
        ? checkIn.targetLng
        : NaN;

      if (!Number.isFinite(storeLat) || !Number.isFinite(storeLng)) continue;

      const color = getItemColor(checkIn);
      const statusText = getItemLabel(checkIn);
      const radius = store.geofenceRadius || 200;

      boundsPoints.push([storeLat, storeLng]);

      // Draw geofence circle or custom territory polygon
      if (store.polygon && store.polygon.length >= 3) {
        const latlngs = store.polygon.map((p) => [p.lat, p.lng] as [number, number]);
        L.polygon(latlngs, {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.18,
        }).addTo(group);
      } else {
        L.circle([storeLat, storeLng], {
          radius,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.14,
          dashArray: "5 4",
        }).addTo(group);
      }

      // Store pin
      const storeIcon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2.5px solid #080E1A;box-shadow:0 0 12px ${color};cursor:pointer;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const arrivalStr = checkIn?.checkInTime
        ? new Date(checkIn.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "Not Checked In";

      const tooltipHtml = `
        <div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;line-height:1.35;min-width:170px;">
          <div style="font-weight:800;color:#0f172a;">${store.name}</div>
          <div style="font-size:10px;color:#475569;margin-bottom:4px;">${store.address || store.state || ""}</div>
          <div style="font-weight:700;color:${
            color === "#34D399" ? "#059669" : color === "#FBBF24" ? "#d97706" : "#dc2626"
          };">${statusText}</div>
          <div style="font-size:10px;color:#334155;margin-top:2px;">
            BA: <strong>${checkIn?.baName || store.baName || "Unassigned"}</strong>
          </div>
          <div style="font-size:10px;color:#334155;">
            Time: ${arrivalStr}${checkIn ? ` · Dist: ${formatDistance(checkIn.distanceMeters)}` : ""}
          </div>
          <div style="font-size:10px;color:#0d9488;font-weight:700;margin-top:3px;">Click pin for full details & photo →</div>
        </div>
      `;

      const marker = L.marker([storeLat, storeLng], { icon: storeIcon })
        .bindTooltip(tooltipHtml, { direction: "top", offset: [0, -10] })
        .addTo(group);

      marker.on("click", () => {
        if (onSelectRecord) onSelectRecord(item);
      });

      // If BA checked in or sent a presence ping at a different coordinate, draw BA live GPS dot & line
      const baLat = checkIn?.lastLat ?? checkIn?.checkInLat;
      const baLng = checkIn?.lastLng ?? checkIn?.checkInLng;
      if (checkIn && isValidCoordinates(baLat, baLng)) {
        boundsPoints.push([baLat!, baLng!]);
        const baIcon = L.divIcon({
          className: "",
          html: `<div class="gf-user-dot"><span class="gf-pulse"></span><span class="gf-core"></span></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        const baMarker = L.marker([baLat!, baLng!], {
          icon: baIcon,
          zIndexOffset: 900,
        })
          .bindTooltip(
            `<strong>${checkIn.baName}</strong> (${store.name}) · ${formatDistance(
              checkIn.distanceMeters
            )}`,
            { direction: "top", offset: [0, -8] }
          )
          .addTo(group);

        baMarker.on("click", () => {
          if (onSelectRecord) onSelectRecord(item);
        });
      }
    }

    if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 15);
    } else if (boundsPoints.length > 1) {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }
  }, [ready, items, onSelectRecord]);

  function handleFitAll() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const pts: [number, number][] = [];
    for (const { store, checkIn } of items) {
      if (isValidCoordinates(store.lat, store.lng)) pts.push([store.lat!, store.lng!]);
      if (checkIn && isValidCoordinates(checkIn.checkInLat, checkIn.checkInLng)) {
        pts.push([checkIn.checkInLat, checkIn.checkInLng]);
      }
    }
    if (pts.length === 1) map.setView(pts[0], 15);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 15 });
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950 ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-xs text-white/50 font-mono">
          Loading Live Field Locations Map…
        </div>
      )}

      {/* Top-Left Legend */}
      <div className="absolute top-3 left-3 z-[500] flex items-center gap-3 flex-wrap px-3 py-1.5 rounded-xl bg-black/75 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white/90">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
          Verified / Checked Out
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
          Flagged Outside Fence
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
          Absent / No-Show
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />
          Live BA GPS Pin
        </span>
      </div>

      {/* Top-Right Controls: Map | Satellite + Fit All */}
      <div className="absolute top-3 right-3 z-[500] flex items-center gap-2">
        <button
          type="button"
          onClick={handleFitAll}
          className="px-2.5 py-1 rounded-lg bg-black/75 hover:bg-black/90 backdrop-blur border border-white/15 text-[10px] font-bold text-white cursor-pointer"
        >
          Fit All ({items.length})
        </button>
        <div className="flex items-center rounded-lg bg-black/75 backdrop-blur border border-white/15 overflow-hidden text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setTileMode("map")}
            className={`px-2.5 py-1 cursor-pointer ${
              tileMode === "map" ? "bg-teal-400 text-black" : "text-white/70 hover:text-white"
            }`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setTileMode("satellite")}
            className={`px-2.5 py-1 cursor-pointer ${
              tileMode === "satellite" ? "bg-teal-400 text-black" : "text-white/70 hover:text-white"
            }`}
          >
            Satellite
          </button>
        </div>
      </div>
    </div>
  );
}
