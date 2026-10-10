/**
 * Color and WCAG Contrast Utilities
 * Ensures dynamic readability across white, light, and vibrant brand themes.
 */

/**
 * Calculates the perceived relative luminance of a hex color (0 to 1).
 * Uses the ITU-R BT.709 / W3C formula.
 */
export function getLuminance(hex: string): number {
  if (!hex) return 0;
  let clean = hex.replace("#", "").trim();

  // Handle 3-digit hex like #FFF
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }

  if (clean.length < 6) return 0;

  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  if (isNaN(r) || isNaN(g) || isNaN(b)) return 0;

  // sRGB gamma expansion
  const sR = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const sG = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const sB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

/**
 * Returns true if the color is considered bright / light (luminance > 0.55).
 */
export function isLightColor(hex: string): boolean {
  return getLuminance(hex) > 0.55;
}

/**
 * Returns optimal readable text color (#070d14 for light backgrounds, #ffffff for dark backgrounds).
 */
export function getContrastTextColor(bgColor: string): string {
  return isLightColor(bgColor) ? "#070d14" : "#ffffff";
}

/**
 * Calculates the average luminance of a gradient between two colors and returns the optimal text color.
 */
export function getGradientContrastColor(startColor: string, endColor: string): string {
  const lum1 = getLuminance(startColor);
  const lum2 = getLuminance(endColor);
  const avgLum = (lum1 + lum2) / 2;
  return avgLum > 0.52 ? "#070d14" : "#ffffff";
}

/**
 * Adjusts ambient orb glow opacity so bright/white colors don't wash out the screen.
 */
export function getAmbientGlowOpacity(color: string, baseOpacity = 0.25): number {
  const lum = getLuminance(color);
  if (lum > 0.8) return Math.min(baseOpacity * 0.4, 0.1);
  if (lum > 0.6) return Math.min(baseOpacity * 0.7, 0.18);
  return baseOpacity;
}
