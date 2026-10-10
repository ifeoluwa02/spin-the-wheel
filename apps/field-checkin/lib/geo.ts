import type { GeoPoint, GeofenceEvaluation } from "./types";

/**
 * Calculates the great-circle distance between two points on Earth using the Haversine formula.
 * @returns Distance in meters (rounded to nearest integer)
 */
export function calculateDistanceMeters(p1: GeoPoint, p2: GeoPoint): number {
  if (
    typeof p1.latitude !== "number" ||
    typeof p1.longitude !== "number" ||
    typeof p2.latitude !== "number" ||
    typeof p2.longitude !== "number"
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
 * Evaluates whether a user's coordinates are inside the store's geofence perimeter.
 * Accounts for realistic indoor GPS signal degradation (roof drift).
 */
export function evaluateGeofence(
  userPos: GeoPoint,
  storePos: GeoPoint,
  allowedRadius = 100
): GeofenceEvaluation {
  const distance = calculateDistanceMeters(userPos, storePos);

  if (distance === Infinity) {
    return {
      inside: false,
      distance: 0,
      status: "out_of_bounds",
      message: "Invalid GPS coordinates.",
    };
  }

  // Exact on-site perimeter (default 100m)
  if (distance <= allowedRadius) {
    return {
      inside: true,
      distance,
      status: "verified",
      message: `Verified on-site (${distance}m from store).`,
    };
  }

  // Indoor mall/supermarket roof drift allowance:
  // If reported accuracy is poor or distance is within radius + accuracy tolerance
  const accuracyTolerance = Math.min(Math.max(userPos.accuracy || 20, 20), 80);
  if (distance <= allowedRadius + accuracyTolerance) {
    return {
      inside: true,
      distance,
      status: "drift",
      message: `On-site with indoor GPS drift (${distance}m away, ±${Math.round(accuracyTolerance)}m tolerance).`,
    };
  }

  return {
    inside: false,
    distance,
    status: "out_of_bounds",
    message: `Outside geofence (${distance}m away, allowed radius is ${allowedRadius}m).`,
  };
}

/**
 * Formats distance in meters into human-readable string (e.g. "24m" or "1.2km").
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}
