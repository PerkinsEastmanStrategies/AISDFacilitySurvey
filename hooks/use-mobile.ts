"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** True below Tailwind's `md` breakpoint (768px). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/**
 * Always use lightweight `*.mobile.svg` floor plans on every device.
 * Falls back to the full SVG when a mobile export has no wall/space geometry.
 */
export function usePrefersMobileFloorPlan(): {
  ready: boolean;
  preferMobile: boolean;
} {
  return { ready: true, preferMobile: true };
}
