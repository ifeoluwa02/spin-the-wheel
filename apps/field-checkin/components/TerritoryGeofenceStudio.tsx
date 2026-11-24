"use client";

import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import type { StorePolygonVertex } from "@/lib/types";
import { isValidCoordinates } from "@/lib/geo";
import { Search, Trash2, Undo2, MapPin, Hexagon } from "lucide-react";

interface TerritoryGeofenceStudioProps {
  lat: number;
  lng: number;
  radius: number;
  polygon?: StorePolygonVertex[];
  onChangeCenter: (lat: number, lng: number) => void;
  onChangePolygon: (polygon: StorePolygonVertex[] | undefined) => void;
  className?: string;
}

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/**
 * Computes approximate planar area (in square meters) of a polygon of lat/lng vertices.
 */
export function calculatePolygonAreaSqMeters(vertices: StorePolygonVertex[]): number {
  if (!vertices || vertices.length < 3) return 0;
  const R = 6378137; // Earth radius in meters
  const refLatRad = (vertices[0].lat * Math.PI) / 180;
  const cosLat = Math.cos(refLatRad);

  const pts = vertices.map((v) => ({
    x: ((v.lng * Math.PI) / 180) * R * cosLat,
    y: ((v.lat * Math.PI) / 180) * R,
  }));

  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.round(Math.abs(area) / 2);
}

export default function TerritoryGeofenceStudio({
  lat,
  lng,
  radius,
  polygon,
  onChangeCenter,
  onChangePolygon,
  className = "",
}: TerritoryGeofenceStudioProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const tileLayerRef = useRef<Leaflet.TileLayer | null>(null);
  const groupRef = useRef<Leaflet.LayerGroup | null>(null);

  const [ready, setReady] = useState(false);
  const [tileMode, setTileMode] = useState<"map" | "satellite">("map");
  const [drawMode, setDrawMode] = useState<"center" | "polygon">(
    polygon && polygon.length >= 3 ? "polygon" : "center"
  );

  // Location Search State
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<{ display_name: string; lat: string; lon: string }>
  >([]);

  // Latest callbacks & state refs for map click handler
  const drawModeRef = useRef(drawMode);
  drawModeRef.current = drawMode;
  const polygonRef = useRef(polygon || []);
  polygonRef.current = polygon || [];
  const onChangeCenterRef = useRef(onChangeCenter);
  onChangeCenterRef.current = onChangeCenter;
  const onChangePolygonRef = useRef(onChangePolygon);
  onChangePolygonRef.current = onChangePolygon;

  const safeLat = isValidCoordinates(lat, lng) ? lat : 6.5244;
  const safeLng = isValidCoordinates(lat, lng) ? lng : 3.3792;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView([safeLat, safeLng], 16);

      tileLayerRef.current = L.tileLayer(TILE_URL, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      map.attributionControl.setPrefix(false);
      groupRef.current = L.layerGroup().addTo(map);

      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        const clickedLat = Number(e.latlng.lat.toFixed(6));
        const clickedLng = Number(e.latlng.lng.toFixed(6));
        if (drawModeRef.current === "center") {
          onChangeCenterRef.current(clickedLat, clickedLng);
        } else {
          const nextPoly = [...polygonRef.current, { lat: clickedLat, lng: clickedLng }];
          onChangePolygonRef.current(nextPoly);
          // Also keep center updated to centroid of polygon
          const avgLat =
            nextPoly.reduce((acc, p) => acc + p.lat, 0) / nextPoly.length;
          const avgLng =
            nextPoly.reduce((acc, p) => acc + p.lng, 0) / nextPoly.length;
          onChangeCenterRef.current(Number(avgLat.toFixed(6)), Number(avgLng.toFixed(6)));
        }
      });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch tile mode
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

  // Render center pin, radius circle, and polygon vertices
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!ready || !L || !map || !group) return;

    group.clearLayers();

    // Draw radius circle
    L.circle([safeLat, safeLng], {
      radius: radius || 200,
      color: "#14B8A6",
      weight: 2,
      fillColor: "#14B8A6",
      fillOpacity: polygon && polygon.length >= 3 ? 0.05 : 0.16,
      dashArray: "6 4",
    }).addTo(group);

    // Draw center marker
    const pinIcon = L.divIcon({
      className: "",
      html: `<div class="gf-target-pin"><span></span></div>`,
      iconSize: [26, 34],
      iconAnchor: [13, 34],
    });
    L.marker([safeLat, safeLng], { icon: pinIcon }).addTo(group);

    // Draw polygon enclosure if vertices exist (Akida red territory enclosure style)
    if (polygon && polygon.length > 0) {
      const latlngs = polygon.map((p) => [p.lat, p.lng] as [number, number]);
      if (polygon.length >= 3) {
        L.polygon(latlngs, {
          color: "#EF4444",
          weight: 2.5,
          fillColor: "#EF4444",
          fillOpacity: 0.25,
        }).addTo(group);
      } else if (polygon.length === 2) {
        L.polyline(latlngs, {
          color: "#EF4444",
          weight: 2.5,
          dashArray: "4 4",
        }).addTo(group);
      }

      polygon.forEach((pt, idx) => {
        const vertexIcon = L.divIcon({
          className: "",
          html: `<div style="width:18px;height:18px;border-radius:9999px;background:#EF4444;color:#fff;font-size:9px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);">${
            idx + 1
          }</div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        L.marker([pt.lat, pt.lng], { icon: vertexIcon }).addTo(group);
      });
    }
  }, [ready, safeLat, safeLng, radius, polygon]);

  async function handleSearchLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!searchText.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
          searchText.trim()
        )}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleSelectSearchResult(r: { display_name: string; lat: string; lon: string }) {
    const nextLat = Number(Number(r.lat).toFixed(6));
    const nextLng = Number(Number(r.lon).toFixed(6));
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
      onChangeCenter(nextLat, nextLng);
      mapRef.current?.setView([nextLat, nextLng], 17);
    }
    setSearchResults([]);
    setSearchText(r.display_name.split(",")[0] || "");
  }

  const polyAreaSqM =
    polygon && polygon.length >= 3
      ? calculatePolygonAreaSqMeters(polygon)
      : Math.round(Math.PI * (radius || 200) * (radius || 200));

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Top Toolbar: Location Search + Draw Mode Switcher + Clear Enclosure */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearchLocation(e);
                  }
                }}
                placeholder="Search location on map (e.g. Gbagada General Hospital, Lagos)..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs text-white bg-black/50 border border-white/15 focus:border-teal-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={searching || !searchText.trim()}
              onClick={handleSearchLocation}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white cursor-pointer disabled:opacity-40"
            >
              {searching ? "..." : "Find"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 mt-1 rounded-xl bg-slate-900 border border-white/20 shadow-2xl z-[600] divide-y divide-white/10 max-h-48 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectSearchResult(r)}
                  className="w-full text-left px-3 py-2 text-xs text-white/85 hover:bg-teal-500/20 hover:text-white transition cursor-pointer"
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Drawing Mode Switcher: Center Pin vs Polygon Enclosure */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center rounded-xl bg-black/50 border border-white/15 overflow-hidden text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setDrawMode("center")}
              className={`px-2.5 py-1.5 flex items-center gap-1 cursor-pointer ${
                drawMode === "center"
                  ? "bg-teal-400 text-black"
                  : "text-white/70 hover:text-white"
              }`}
            >
              <MapPin className="w-3 h-3" />
              <span>Pin & Radius</span>
            </button>
            <button
              type="button"
              onClick={() => setDrawMode("polygon")}
              className={`px-2.5 py-1.5 flex items-center gap-1 cursor-pointer ${
                drawMode === "polygon"
                  ? "bg-red-500 text-white"
                  : "text-white/70 hover:text-white"
              }`}
            >
              <Hexagon className="w-3 h-3" />
              <span>Draw Boundary ({polygon?.length || 0})</span>
            </button>
          </div>

          {polygon && polygon.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  const next = polygon.slice(0, -1);
                  onChangePolygon(next.length > 0 ? next : undefined);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-[11px] font-bold text-white/80 flex items-center gap-1 cursor-pointer"
                title="Undo last boundary point"
              >
                <Undo2 className="w-3 h-3" />
                <span>Undo</span>
              </button>
              <button
                type="button"
                onClick={() => onChangePolygon(undefined)}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-bold text-amber-300 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear Enclosure</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Interactive Map Canvas */}
      <div className="relative h-72 sm:h-80 w-full rounded-2xl overflow-hidden border border-white/15 bg-slate-950">
        <div ref={containerRef} className="absolute inset-0" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-xs text-white/50 font-mono">
            Loading Territory Geofencing Studio…
          </div>
        )}

        {/* Top-Left Instruction & Area Badge */}
        <div className="absolute top-2.5 left-2.5 z-[500] px-3 py-1.5 rounded-xl bg-black/75 backdrop-blur border border-white/15 text-[10px] font-mono text-white/90 space-y-0.5 pointer-events-none">
          <div className="font-bold text-teal-300">
            {drawMode === "center"
              ? "Click anywhere on map to place store center pin"
              : "Click corners on map to draw territory boundary"}
          </div>
          <div>
            Area Cover: <strong className="text-white">{polyAreaSqM.toLocaleString()} m²</strong>
            {polygon && polygon.length >= 3
              ? ` · Custom Polygon (${polygon.length} vertices)`
              : ` · Circle Radius (${radius || 200}m)`}
          </div>
        </div>

        {/* Top-Right Map | Satellite Switcher */}
        <div className="absolute top-2.5 right-2.5 z-[500] flex items-center rounded-lg bg-black/75 backdrop-blur border border-white/15 overflow-hidden text-[10px] font-bold">
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

      {/* Polygon Coordinates Readout (Akida Coordinates list parity) */}
      {polygon && polygon.length > 0 && (
        <div className="p-2.5 rounded-xl bg-black/40 border border-red-500/30 text-[10px] font-mono text-white/75 flex items-center justify-between gap-2 flex-wrap">
          <div className="truncate">
            <span className="text-red-400 font-bold">Enclosure Coordinates: </span>
            {polygon.map((p, i) => `(#${i + 1}: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`).join(" · ")}
          </div>
          <span className="text-amber-300 font-bold flex-shrink-0">
            {polygon.length < 3
              ? `Add ${3 - polygon.length} more point(s) to close polygon`
              : `✓ Polygon Active (${polyAreaSqM.toLocaleString()} m²)`}
          </span>
        </div>
      )}
    </div>
  );
}
