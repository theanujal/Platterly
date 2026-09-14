import * as React from "react"

const MOBILE_BREAKPOINT = 768

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
