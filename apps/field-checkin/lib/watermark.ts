/**
 * GPS Map Camera Watermark Engine (client-only)
 * ------------------------------------------------------------------
 * Burns a "GPS Map Camera"-style evidence banner directly into the
 * bottom of the selfie canvas, so BAs / Nurse Activators never need to
 * install a third-party APK.
 *
 * Banner contents:
 *   - Mini map thumbnail (OSM tiles, falls back to a vector radar offline)
 *     with the geofence circle, target pin and the BA's GPS dot.
 *   - Location name & address
 *   - GPS coordinates
 *   - Timestamp in WAT (Africa/Lagos)
 *   - Geofence status & accuracy
 */

export type WatermarkGeofenceStatus = "verified" | "drift" | "out_of_bounds" | "pending";

export interface WatermarkInfo {
  locationName: string;
  address?: string;
  baName?: string;
  /** BA's actual GPS position at the time of the snap */
  userLat?: number;
  userLng?: number;
  accuracy?: number;
  /** Target store / facility pin */
  targetLat?: number;
  targetLng?: number;
  geofenceRadius?: number;
  distanceMeters?: number;
  status: WatermarkGeofenceStatus;
  timestamp?: Date;
  isSimulated?: boolean;
}

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_SIZE = 256;
const TILE_TIMEOUT_MS = 2500;

// ── Formatting helpers ──────────────────────────────────────────────

export function formatCoord(value: number, axis: "lat" | "lng"): string {
  const hemi = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(6)}° ${hemi}`;
}

/** e.g. "17 Oct 2026, 11:45 AM WAT" — always in Africa/Lagos regardless of device TZ */
export function formatWAT(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()} WAT`;
}

const STATUS_STYLE: Record<WatermarkGeofenceStatus, { label: string; color: string }> = {
  verified: { label: "On-Site Verified", color: "#34D399" },
  drift: { label: "On-Site · Indoor GPS Drift", color: "#FBBF24" },
  out_of_bounds: { label: "Outside Geofence", color: "#F87171" },
  pending: { label: "GPS Lock Pending", color: "#94A3B8" },
};

// ── Map tile helpers (Web Mercator) ─────────────────────────────────

function lngLatToTileFloat(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

function metersPerPixel(lat: number, z: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

function loadTile(z: number, x: number, y: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // keeps the canvas untainted so toDataURL works
    const timer = setTimeout(() => reject(new Error("tile timeout")), TILE_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("tile error"));
    };
    img.src = TILE_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  });
}

/**
 * Renders a square map thumbnail centred on the BA's position, including
 * the target geofence circle + pin and the BA's blue dot.
 * Falls back to a vector "radar" if tiles can't load (offline / blocked).
 */
async function renderMapThumbnail(info: WatermarkInfo, size: number): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;

  const centerLat = info.userLat ?? info.targetLat;
  const centerLng = info.userLng ?? info.targetLng;
  const radius = info.geofenceRadius || 100;

  // Pick a zoom where the geofence radius occupies ~1/3 of the thumbnail
  let z = 18;
  if (centerLat !== undefined) {
    while (z > 12 && radius / metersPerPixel(centerLat, z) > TILE_SIZE * 0.35) z--;
  }

  let tilesOk = false;
  let project: ((lat: number, lng: number) => { x: number; y: number }) | null = null;

  if (centerLat !== undefined && centerLng !== undefined) {
    const f = lngLatToTileFloat(centerLat, centerLng, z);
    const tx0 = Math.floor(f.x - 0.5);
    const ty0 = Math.floor(f.y - 0.5);
    // Pixel of the centre point inside the 512x512 2x2 tile mosaic
    const cx = (f.x - tx0) * TILE_SIZE;
    const cy = (f.y - ty0) * TILE_SIZE;
    const scale = size / TILE_SIZE; // 256 mosaic px window → thumbnail size

    project = (lat, lng) => {
      const p = lngLatToTileFloat(lat, lng, z);
      return {
        x: ((p.x - tx0) * TILE_SIZE - cx) * scale + size / 2,
        y: ((p.y - ty0) * TILE_SIZE - cy) * scale + size / 2,
      };
    };

    try {
      const coords = [
        [0, 0], [1, 0], [0, 1], [1, 1],
      ];
      const imgs = await Promise.all(coords.map(([dx, dy]) => loadTile(z, tx0 + dx, ty0 + dy)));
      ctx.save();
      ctx.translate(size / 2 - cx * scale, size / 2 - cy * scale);
      ctx.scale(scale, scale);
      imgs.forEach((img, i) => {
        const [dx, dy] = coords[i];
        ctx.drawImage(img, dx * TILE_SIZE, dy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      });
      ctx.restore();
      tilesOk = true;
    } catch {
      tilesOk = false;
    }
  }

  if (!tilesOk) {
    // Vector radar fallback
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 1.4);
    g.addColorStop(0, "#12324A");
    g.addColorStop(1, "#08131F");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(45,212,191,0.18)";
    ctx.lineWidth = 1;
    for (let r = size / 6; r < size; r += size / 6) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
  }

  const status = STATUS_STYLE[info.status];

  // Geofence circle + target pin
  if (project && info.targetLat !== undefined && info.targetLng !== undefined && centerLat !== undefined) {
    const t = project(info.targetLat, info.targetLng);
    const rPx = (radius / metersPerPixel(centerLat, z)) * (size / TILE_SIZE);

    ctx.beginPath();
    ctx.arc(t.x, t.y, rPx, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(status.color, 0.18);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, size / 70);
    ctx.strokeStyle = status.color;
    ctx.stroke();

    drawPin(ctx, t.x, t.y, size / 9, "#EF4444");
  }

  // BA position dot (centre)
  if (info.userLat !== undefined) {
    const d = Math.max(4, size / 22);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, d * 1.9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(59,130,246,0.25)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, d, 0, Math.PI * 2);
    ctx.fillStyle = "#3B82F6";
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, d / 2.5);
    ctx.strokeStyle = "#FFFFFF";
    ctx.stroke();
  }

  // Tile attribution (required by OSM usage policy)
  if (tilesOk) {
    const fs = Math.max(7, Math.round(size / 18));
    ctx.font = `500 ${fs}px Inter, system-ui, sans-serif`;
    const txt = "© OpenStreetMap";
    const w = ctx.measureText(txt).width + 6;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(size - w, size - fs - 4, w, fs + 4);
    ctx.fillStyle = "#334155";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, size - w + 3, size - (fs + 4) / 2);
  }

  return c;
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, tipY: number, h: number, color: string) {
  const r = h * 0.38;
  const cy = tipY - h + r;
  ctx.beginPath();
  ctx.moveTo(x, tipY);
  ctx.bezierCurveTo(x - r * 0.4, tipY - h * 0.35, x - r, cy + r * 0.6, x - r, cy);
  ctx.arc(x, cy, r, Math.PI, 0);
  ctx.bezierCurveTo(x + r, cy + r * 0.6, x + r * 0.4, tipY - h * 0.35, x, tipY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, h / 12);
  ctx.strokeStyle = "#FFFFFF";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, cy, r * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
}

function hexToRgba(hex: string, a: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// ── Main entry ──────────────────────────────────────────────────────

/**
 * Draws the GPS Map Camera banner onto the bottom of an existing canvas.
 * Call AFTER the camera frame has been drawn. Resets any transform
 * (e.g. selfie mirroring) so text is never rendered backwards.
 */
export async function drawGpsWatermark(canvas: HTMLCanvasElement, info: WatermarkInfo): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const W = canvas.width;
  const H = canvas.height;
  const s = W / 640; // scale factor relative to a 640px-wide reference
  const margin = Math.round(10 * s);
  const pad = Math.round(10 * s);
  const bannerH = Math.round(Math.min(H * 0.34, 138 * s));
  const bx = margin;
  const by = H - bannerH - margin;
  const bw = W - margin * 2;
  const status = STATUS_STYLE[info.status];

  // Banner background (dark glass) + status accent bar
  ctx.save();
  roundRect(ctx, bx, by, bw, bannerH, 12 * s);
  ctx.fillStyle = "rgba(8, 14, 26, 0.72)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.2 * s);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.stroke();
  ctx.clip();
  ctx.fillStyle = status.color;
  ctx.fillRect(bx, by, Math.max(3, 4 * s), bannerH);
  ctx.restore();

  // Header tag above the banner
  const tagFs = Math.round(10 * s);
  ctx.font = `800 ${tagFs}px Inter, system-ui, sans-serif`;
  const tag = info.isSimulated ? "GPS MAP CAMERA · DEMO" : "GPS MAP CAMERA";
  const tagW = ctx.measureText(tag).width + 16 * s;
  const tagH = tagFs + 8 * s;
  roundRect(ctx, bx + bw - tagW, by - tagH - 4 * s, tagW, tagH, tagH / 2);
  ctx.fillStyle = info.isSimulated ? "rgba(245,158,11,0.9)" : "rgba(20,184,166,0.92)";
  ctx.fill();
  ctx.fillStyle = "#04121A";
  ctx.textBaseline = "middle";
  ctx.fillText(tag, bx + bw - tagW + 8 * s, by - tagH / 2 - 4 * s);

  // Map thumbnail
  const mapSize = bannerH - pad * 2;
  const mapX = bx + pad + 4 * s;
  const mapY = by + pad;
  const thumb = await renderMapThumbnail(info, Math.round(mapSize * 2)); // 2x for crispness
  ctx.save();
  roundRect(ctx, mapX, mapY, mapSize, mapSize, 8 * s);
  ctx.clip();
  ctx.drawImage(thumb, mapX, mapY, mapSize, mapSize);
  ctx.restore();
  roundRect(ctx, mapX, mapY, mapSize, mapSize, 8 * s);
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.stroke();

  // Text block
  const tx = mapX + mapSize + pad * 1.2;
  const tMax = bx + bw - tx - pad;
  const lines: { text: string; font: string; color: string }[] = [];
  const hasGps = info.userLat !== undefined && info.userLng !== undefined;

  lines.push({
    text: info.locationName || "Unknown Location",
    font: `800 ${Math.round(17 * s)}px Rubik, Inter, system-ui, sans-serif`,
    color: "#FFFFFF",
  });
  if (info.address) {
    lines.push({
      text: info.address,
      font: `500 ${Math.round(11.5 * s)}px Inter, system-ui, sans-serif`,
      color: "rgba(255,255,255,0.78)",
    });
  }
  lines.push({
    text: hasGps
      ? `Lat ${formatCoord(info.userLat!, "lat")}   Long ${formatCoord(info.userLng!, "lng")}`
      : "Lat —   Long —",
    font: `600 ${Math.round(11.5 * s)}px "JetBrains Mono", ui-monospace, monospace`,
    color: "#99F6E4",
  });
  lines.push({
    text: formatWAT(info.timestamp || new Date()) + (info.baName ? `  ·  ${info.baName}` : ""),
    font: `600 ${Math.round(11.5 * s)}px Inter, system-ui, sans-serif`,
    color: "rgba(255,255,255,0.88)",
  });

  const lineGap = 5 * s;
  const sizes = lines.map((l) => parseInt(l.font.match(/(\d+)px/)![1], 10));
  const statusH = Math.round(20 * s);
  const totalH = sizes.reduce((a, b) => a + b + lineGap, 0) + statusH;
  let y = by + (bannerH - totalH) / 2;

  ctx.textBaseline = "top";
  lines.forEach((l, i) => {
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.fillText(fitText(ctx, l.text, tMax), tx, y);
    y += sizes[i] + lineGap;
  });

  // Status pill
  const accTxt =
    info.accuracy !== undefined ? ` · ±${Math.round(info.accuracy)}m` : "";
  const distTxt =
    info.distanceMeters !== undefined && info.status !== "verified"
      ? ` · ${info.distanceMeters}m from pin`
      : "";
  const pillText = `${status.label}${accTxt}${distTxt}`;
  ctx.font = `800 ${Math.round(11 * s)}px Inter, system-ui, sans-serif`;
  const dotR = 4 * s;
  const pillW = Math.min(tMax, ctx.measureText(pillText).width + dotR * 2 + 20 * s);
  roundRect(ctx, tx, y, pillW, statusH, statusH / 2);
  ctx.fillStyle = hexToRgba(status.color, 0.2);
  ctx.fill();
  ctx.lineWidth = Math.max(1, s);
  ctx.strokeStyle = hexToRgba(status.color, 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tx + 8 * s + dotR, y + statusH / 2, dotR, 0, Math.PI * 2);
  ctx.fillStyle = status.color;
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "middle";
  ctx.fillText(
    fitText(ctx, pillText, pillW - dotR * 2 - 18 * s),
    tx + 12 * s + dotR * 2,
    y + statusH / 2 + 0.5
  );
}
