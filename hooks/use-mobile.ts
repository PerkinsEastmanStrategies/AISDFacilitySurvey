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
 * Floor-plan loading always uses the full (non-mobile) SVG.
 * Kept for call-site compatibility; `preferMobile` is always false.
 */
export function usePrefersMobileFloorPlan(): {
  ready: boolean;
  preferMobile: boolean;
} {
  return { ready: true, preferMobile: false };
}
