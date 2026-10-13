"use client"

import { useEffect } from "react"

/**
 * A focused number field changes its value when the mouse wheel or trackpad scrolls over it (250 becomes 249 or 251),
 * so someone scrolling a drawer after typing a price changes it without noticing. Mounted once in each root layout:
 * when the wheel turns over the field that has focus, the field loses focus first, so the value is left alone and the
 * page scrolls as expected. Covers every number field, present and future, without each one having to remember.
 */
export function NoWheelNumberInputs() {
  useEffect(() => {
    function onWheel(event: WheelEvent) {
      const active = document.activeElement
      if (active instanceof HTMLInputElement && active.type === "number" && event.target === active) active.blur()
    }
    document.addEventListener("wheel", onWheel, { capture: true, passive: true })
    return () => document.removeEventListener("wheel", onWheel, { capture: true })
  }, [])
  return null
}
