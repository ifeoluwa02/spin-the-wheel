import type { Prize } from "@/types";

/**
 * Picks a prize index using each prize's `weight` as a relative probability.
 * Weights are normalized internally, so they can be entered as percentages
 * (2, 5, 20, 10, 60, 3) or any other relative scale.
 */
export function pickPrizeIndex(prizes: Prize[]): number {
  const totalWeight = prizes.reduce((sum, p) => sum + Math.max(p.weight, 0), 0);
  if (totalWeight <= 0) {
    // Fallback: uniform random if no weights are configured
    return Math.floor(Math.random() * prizes.length);
  }

  let roll = Math.random() * totalWeight;
  for (let i = 0; i < prizes.length; i++) {
    roll -= Math.max(prizes[i].weight, 0);
    if (roll <= 0) return i;
  }
  return prizes.length - 1;
}
