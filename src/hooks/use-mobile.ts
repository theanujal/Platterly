import * as React from "react"

// 1024, not shadcn's stock 768: the 256px sidebar left only ~560px for the page on a tablet in
// portrait (iPad 768-834px), cutting off tables, tabs and the calendar. Under 1024px the sidebar is
// the slide-out drawer it already is on a phone.
const MOBILE_BREAKPOINT = 1024

// useSyncExternalStore instead of shadcn's stock useState+useEffect
// generated version — that version called setState directly in the effect
// body (not from within the change-event callback), which trips
// eslint-plugin-react-hooks' set-state-in-effect rule. This is also the
// React-recommended shape for subscribing to an external source like
// matchMedia, and is SSR-safe via getServerSnapshot.
function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
