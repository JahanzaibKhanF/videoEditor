"use client";

import { useEffect, useState } from "react";

/**
 * useIsTouch — true when the primary input is touch-like (coarse pointer or
 * no hover capability). Paired with useIsMobile so a small *desktop* browser
 * window doesn't get the touch-only editor tree — only an actual phone/tablet
 * (narrow AND coarse-pointer) does.
 */
export function useIsTouch(): boolean {
  const query = "(pointer: coarse), (hover: none)";
  const [isTouch, setIsTouch] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    setIsTouch(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isTouch;
}
