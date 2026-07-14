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
 * Prefer lightweight `*.mobile.svg` floor plans on narrow viewports only.
 * Do not key off `pointer: coarse` — touchscreen laptops would otherwise load
 * incomplete mobile exports (labels without walls) on large screens.
 */
export function usePrefersMobileFloorPlan(): {
  ready: boolean;
  preferMobile: boolean;
} {
  const [state, setState] = useState({ ready: false, preferMobile: false });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const update = () =>
      setState({ ready: true, preferMobile: mediaQuery.matches });
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return state;
}
