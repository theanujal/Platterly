"use client";

import { useEffect } from "react";

/** A step change in the plan journey is a new screen, like in a phone app: start it at the top, not wherever the last one was scrolled to. */
export function ScrollToTop() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  return null;
}
