import type { Prize } from "@/types";

/**
 * Checks if a prize item is currently in stock.
 * If remainingStockOverride is provided, checks against it (> 0).
 * If quantity is undefined/null, it is considered unlimited stock.
 */
export function isPrizeInStock(prize: Prize, remainingStockOverride?: number | null): boolean {
  if (prize.isLosing) return true; // Losing / Try Again segments are always available
  if (prize.globallyPaused) return false; // Globally paused — excluded from all wheels
  if (remainingStockOverride !== undefined && remainingStockOverride !== null) {
    return remainingStockOverride > 0;
  }
  if (prize.quantity === undefined || prize.quantity === null || prize.quantity < 0) {
    return true; // Unlimited
  }
  const claimed = prize.claimedCount || 0;
  return claimed < prize.quantity;
}

/**
 * Gets remaining stock for a prize item.
 * Returns Infinity if stock is unlimited.
 */
export function getRemainingStock(prize: Prize, remainingStockOverride?: number | null): number {
  if (remainingStockOverride !== undefined && remainingStockOverride !== null) {
    return Math.max(0, remainingStockOverride);
  }
  if (prize.quantity === undefined || prize.quantity === null || prize.quantity < 0) {
    return Infinity;
  }
  return Math.max(0, prize.quantity - (prize.claimedCount || 0));
}

/**
 * Picks a prize index using each prize's `weight` as a relative probability,
 * automatically filtering out any prizes that are OUT OF STOCK (globally or per store).
 */
export function pickPrizeIndex(
  prizes: Prize[],
  remainingStockMap?: Record<string, number | null>
): number {
  // Calculate weights only for in-stock prizes
  const effectiveWeights = prizes.map((p) => {
    const remaining = remainingStockMap ? remainingStockMap[p.id] : undefined;
    if (!isPrizeInStock(p, remaining)) return 0; // Exclude out-of-stock items
    return Math.max(p.weight, 0);
  });

  const totalWeight = effectiveWeights.reduce((sum, w) => sum + w, 0);

  if (totalWeight <= 0) {
    // If all winning prizes are out of stock, fallback to the first losing segment
    const losingIdx = prizes.findIndex((p) => p.isLosing);
    if (losingIdx !== -1) return losingIdx;
    // Or uniform fallback
    return Math.floor(Math.random() * prizes.length);
  }

  let roll = Math.random() * totalWeight;
  for (let i = 0; i < prizes.length; i++) {
    roll -= effectiveWeights[i];
    if (roll <= 0) return i;
  }

  return prizes.length - 1;
}
