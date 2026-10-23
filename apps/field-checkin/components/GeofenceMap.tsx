"use client";

import React, { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";

export type MapGeofenceStatus = "verified" | "drift" | "out_of_bounds" | "pending";

interface GeofenceMapProps {
  targetLat: number;
  targetLng: number;
  radius: number;
  targetLabel?: string;
  userLat?: number;
  userLng?: number;
  accuracy?: number;
  status: MapGeofenceStatus;
  className?: string;
}

const STATUS_COLOR: Record<MapGeofenceStatus, string> = {
  verified: "#34D399",
  drift: "#FBBF24",
  out_of_bounds: "#F87171",
  pending: "#94A3B8",
};

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Live geofence map (OpenStreetMap + Leaflet).
 * Shows the target pin, the geofence boundary circle (coloured by status),
 * and the BA's pulsing blue GPS dot with its accuracy halo.
 * Leaflet is imported dynamically so it never runs during SSR.
 */
export default function GeofenceMap({
  targetLat,
  targetLng,
  radius,
  targetLabel,
  userLat,
  userLng,
  accuracy,
  status,
  className = "",
}: GeofenceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layersRef = useRef<{
    fence?: Leaflet.Circle;
    target?: Leaflet.Marker;
    user?: Leaflet.Marker;
    accuracy?: Leaflet.Circle;
  }>({});
  const lastFitKey = useRef<string>("");
  const [ready, setReady] = React.useState(false);

  // ── Init map once ──
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
      }).setView([targetLat, targetLng], 17);

      L.tileLayer(TILE_URL, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      map.attributionControl.setPrefix(false);

      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = {};
      lastFitKey.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync layers whenever props change ──
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const layers = layersRef.current;
    const color = STATUS_COLOR[status];

    // Geofence boundary
    if (!layers.fence) {
      layers.fence = L.circle([targetLat, targetLng], {
        radius,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.15,
        dashArray: "6 4",
      }).addTo(map);
    } else {
      layers.fence.setLatLng([targetLat, targetLng]);
      layers.fence.setRadius(radius);
      layers.fence.setStyle({ color, fillColor: color });
    }

    // Target pin
    const pinIcon = L.divIcon({
      className: "",
      html: `<div class="gf-target-pin"><span></span></div>`,
      iconSize: [26, 34],
      iconAnchor: [13, 34],
    });
    if (!layers.target) {
      layers.target = L.marker([targetLat, targetLng], { icon: pinIcon, keyboard: false }).addTo(map);
    } else {
      layers.target.setLatLng([targetLat, targetLng]);
    }
    if (targetLabel) layers.target.bindTooltip(targetLabel, { direction: "top", offset: [0, -32] });

    // BA position + accuracy halo
    const hasUser = typeof userLat === "number" && typeof userLng === "number";
    if (hasUser) {
      const userIcon = L.divIcon({
        className: "",
        html: `<div class="gf-user-dot"><span class="gf-pulse"></span><span class="gf-core"></span></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      if (!layers.user) {
        layers.user = L.marker([userLat!, userLng!], { icon: userIcon, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      } else {
        layers.user.setLatLng([userLat!, userLng!]);
      }
      const accR = Math.max(accuracy || 0, 3);
      if (!layers.accuracy) {
        layers.accuracy = L.circle([userLat!, userLng!], {
          radius: accR,
          color: "#3B82F6",
          weight: 1,
          fillColor: "#3B82F6",
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(map);
      } else {
        layers.accuracy.setLatLng([userLat!, userLng!]);
        layers.accuracy.setRadius(accR);
      }
    } else {
      layers.user?.remove();
      layers.accuracy?.remove();
      layers.user = undefined;
      layers.accuracy = undefined;
    }

    // Re-fit only when the target changes or the user first appears / mode jumps
    // (not on every GPS tick — that would fight the BA's own panning).
    const fitKey = `${targetLat.toFixed(5)},${targetLng.toFixed(5)},${radius},${hasUser ? "u" : "-"},${status === "out_of_bounds" ? "o" : "i"}`;
    if (fitKey !== lastFitKey.current) {
      lastFitKey.current = fitKey;
      let bounds = layers.fence.getBounds();
      if (hasUser) bounds = bounds.extend([userLat!, userLng!]);
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 });
    }
  }, [ready, targetLat, targetLng, radius, targetLabel, userLat, userLng, accuracy, status]);

  return (
    <div className={`gf-map relative overflow-hidden rounded-xl border border-white/10 ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-[11px] text-white/50 font-mono">
          Loading map…
        </div>
      )}
      <div className="absolute top-2 left-2 z-[500] flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 backdrop-blur text-[10px] font-mono text-white/80 pointer-events-none">
        <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
        <span>Geofence {radius}m</span>
      </div>
    </div>
  );
}
