import type {
  GeoPoint,
  GeofenceEvaluation,
  GpsTelemetryEvaluation,
  SpoofRisk,
  StorePolygonVertex,
} from "./types";

/** Maximum acceptable GPS accuracy uncertainty (meters) before rejecting a fix as too weak */
export const MAX_ALLOWED_ACCURACY_M = 150;

/** Maximum indoor roof-drift buffer (meters) beyond the configured geofence radius */
export const MAX_DRIFT_TOLERANCE_M = 50;

/** Minimum and maximum allowed geofence radius (meters) */
export const MIN_GEOFENCE_RADIUS_M = 50;
export const MAX_GEOFENCE_RADIUS_M = 500;

/**
 * Validates that latitude and longitude are finite numbers within valid Earth bounds
 * and not at Null Island (0, 0).
 */
export function isValidCoordinates(lat?: unknown, lng?: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  return true;
}

/**
 * Calculates the great-circle distance between two points on Earth using the Haversine formula.
 * @returns Distance in meters (rounded to nearest integer), or Infinity if coordinates are invalid.
 */
export function calculateDistanceMeters(p1: GeoPoint, p2: GeoPoint): number {
  if (
    !isValidCoordinates(p1?.latitude, p1?.longitude) ||
    !isValidCoordinates(p2?.latitude, p2?.longitude)
  ) {
    return Infinity;
  }

  const R = 6371e3; // Earth's mean radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(p2.latitude - p1.latitude);
  const dLon = toRad(p2.longitude - p1.longitude);
  const lat1 = toRad(p1.latitude);
  const lat2 = toRad(p2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Ray-casting point-in-polygon check for multi-point cluster boundaries.
 */
export function isPointInPolygon(
  point: GeoPoint,
  polygon?: StorePolygonVertex[]
): boolean {
  if (!polygon || polygon.length < 3) return false;
  if (!isValidCoordinates(point.latitude, point.longitude)) return false;

  let inside = false;
  const x = point.longitude;
  const y = point.latitude;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Evaluates whether a user's coordinates are inside the store's geofence perimeter.
 * Enforces:
 *  1. Valid user & store coordinates (never falls back to user's own position).
 *  2. Maximum accuracy threshold (rejects coarse cell-tower fixes > 150m).
 *  3. Optional polygon boundary check + circular Haversine radius check (clamped 50m..500m).
 *  4. Bounded indoor roof-drift buffer (up to 50m) marked as `drift` so the server flags it for supervisor review.
 */
export function evaluateGeofence(
  userPos: GeoPoint,
  storePos: GeoPoint,
  allowedRadius = 200,
  polygon?: StorePolygonVertex[]
): GeofenceEvaluation {
  if (!isValidCoordinates(storePos?.latitude, storePos?.longitude)) {
    return {
      inside: false,
      distance: -1,
      status: "out_of_bounds",
      message: "Store GPS coordinates are not configured. Contact your supervisor.",
    };
  }

  if (!isValidCoordinates(userPos?.latitude, userPos?.longitude)) {
    return {
      inside: false,
      distance: -1,
      status: "out_of_bounds",
      message: "Invalid or missing device GPS coordinates.",
    };
  }

  const safeRadius = Math.min(
    Math.max(Number(allowedRadius) || 200, MIN_GEOFENCE_RADIUS_M),
    MAX_GEOFENCE_RADIUS_M
  );
  const distance = calculateDistanceMeters(userPos, storePos);

  if (distance === Infinity) {
    return {
      inside: false,
      distance: -1,
      status: "out_of_bounds",
      message: "Invalid GPS coordinates.",
    };
  }

  // Reject fixes with excessively coarse accuracy (e.g., cell tower / IP fallback > 150m)
  if (typeof userPos.accuracy === "number" && userPos.accuracy > MAX_ALLOWED_ACCURACY_M) {
    return {
      inside: false,
      distance,
      status: "out_of_bounds",
      message: `GPS accuracy is too weak (±${Math.round(userPos.accuracy)}m, max ±${MAX_ALLOWED_ACCURACY_M}m). Step near a window or outdoors and refresh GPS.`,
    };
  }

  // Optional polygon cluster check
  if (polygon && polygon.length >= 3 && isPointInPolygon(userPos, polygon)) {
    return {
      inside: true,
      distance,
      status: "verified",
      message: `Verified inside store cluster boundary (${distance}m from center).`,
    };
  }

  // Exact on-site perimeter (default 200m)
  if (distance <= safeRadius) {
    return {
      inside: true,
      distance,
      status: "verified",
      message: `Verified on-site (${distance}m from store, within ${safeRadius}m fence).`,
    };
  }

  // Bounded indoor roof drift: only when accuracy halo overlaps the fence boundary, capped at 50m
  const reportedAccuracy =
    typeof userPos.accuracy === "number" && userPos.accuracy > 0 ? userPos.accuracy : 0;
  const driftAllowance = Math.min(reportedAccuracy, MAX_DRIFT_TOLERANCE_M);

  if (driftAllowance > 0 && distance <= safeRadius + driftAllowance) {
    return {
      inside: true,
      distance,
      status: "drift",
      message: `Borderline indoor GPS drift (${distance}m away, ±${Math.round(reportedAccuracy)}m accuracy) — flagged for supervisor review.`,
    };
  }

  return {
    inside: false,
    distance,
    status: "out_of_bounds",
    message: `Outside geofence (${distance}m away, allowed radius is ${safeRadius}m).`,
  };
}

/**
 * Analyzes GPS telemetry (fix freshness, multi-sample jitter, velocity jumps, and simulation flags)
 * to detect potential mock-location / spoofing anomalies on the web.
 */
export function evaluateGpsTelemetry(
  currentPos: GeoPoint,
  samples?: GeoPoint[],
  isSimulated?: boolean
): GpsTelemetryEvaluation {
  const reasons: string[] = [];
  let risk: SpoofRisk = "low";
  let freshnessOk = true;
  const now = Date.now();

  if (isSimulated) {
    reasons.push("Demo simulator mode active");
    risk = "medium";
  }

  if (typeof currentPos.timestamp === "number") {
    const ageMs = now - currentPos.timestamp;
    if (ageMs > 120_000) {
      reasons.push(`Stale GPS fix (${Math.round(ageMs / 1000)}s old)`);
      freshnessOk = false;
      risk = "medium";
    } else if (ageMs < -30_000) {
      reasons.push("GPS timestamp is in the future (clock skew / spoof)");
      freshnessOk = false;
      risk = "high";
    }
  }

  if (typeof currentPos.accuracy === "number") {
    if (currentPos.accuracy <= 0) {
      reasons.push("Impossible GPS accuracy (<= 0m)");
      risk = "high";
    } else if (currentPos.accuracy > 100) {
      reasons.push(`Coarse GPS accuracy (±${Math.round(currentPos.accuracy)}m)`);
      if (risk === "low") risk = "medium";
    }
  }

  if (Array.isArray(samples) && samples.length >= 2) {
    const validSamples = samples.filter((s) =>
      isValidCoordinates(s?.latitude, s?.longitude)
    );
    if (validSamples.length >= 3) {
      // Check if all 3+ samples have identical coordinates to 7 decimal places (typical static mock injector)
      const first = validSamples[0];
      const allIdentical = validSamples.every(
        (s) =>
          Math.abs(s.latitude - first.latitude) < 1e-7 &&
          Math.abs(s.longitude - first.longitude) < 1e-7
      );
      if (allIdentical && !isSimulated) {
        reasons.push("Zero GPS jitter across multiple fixes (possible static mock provider)");
        if (risk === "low") risk = "medium";
      }

      // Check for impossible velocity jump (> 60 m/s = 216 km/h) between consecutive samples
      for (let i = 1; i < validSamples.length; i++) {
        const prev = validSamples[i - 1];
        const curr = validSamples[i];
        const dist = calculateDistanceMeters(prev, curr);
        const dtSec =
          prev.timestamp && curr.timestamp
            ? Math.max(1, Math.abs(curr.timestamp - prev.timestamp) / 1000)
            : 5;
        if (dist !== Infinity && dist > 150 && dist / dtSec > 60) {
          reasons.push(`Sudden GPS jump (${dist}m in ${Math.round(dtSec)}s)`);
          risk = "high";
          break;
        }
      }
    }
  }

  return {
    spoofRisk: risk,
    spoofReasons: reasons,
    freshnessOk,
  };
}

/**
 * Formats distance in meters into human-readable string (e.g. "24m" or "1.2km").
 */
export function formatDistance(meters: number): string {
  if (typeof meters !== "number" || meters < 0 || !Number.isFinite(meters)) {
    return "N/A";
  }
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}
