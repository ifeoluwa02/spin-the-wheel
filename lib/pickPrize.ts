import type { Prize } from "@/types";

/**
 * Checks if a prize item is currently in stock.
 * If quantity is undefined/null, it is considered unlimited stock.
 */
export function isPrizeInStock(prize: Prize): boolean {
  if (prize.isLosing) return true; // Losing / Try Again segments are always available
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
export function getRemainingStock(prize: Prize): number {
  if (prize.quantity === undefined || prize.quantity === null || prize.quantity < 0) {
    return Infinity;
  }
  return Math.max(0, prize.quantity - (prize.claimedCount || 0));
}

/**
 * Picks a prize index using each prize's `weight` as a relative probability,
 * automatically filtering out any prizes that are OUT OF STOCK.
 */
export function pickPrizeIndex(prizes: Prize[]): number {
  // Calculate weights only for in-stock prizes
  const effectiveWeights = prizes.map((p) => {
    if (!isPrizeInStock(p)) return 0; // Exclude out-of-stock items
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
