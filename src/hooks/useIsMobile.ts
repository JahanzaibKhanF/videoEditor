"use client";

import { useEffect, useState } from "react";

/**
 * useIsMobile — true when the viewport is at/below the given breakpoint.
 * Backed by matchMedia (not a resize listener) so it updates correctly on
 * device rotation and responds instantly without debouncing.
 */
export function useIsMobile(breakpointPx = 768): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(`(max-width: ${breakpointPx}px)`).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpointPx]);

  return isMobile;
}
