"use client"

import * as React from "react"
import { cn } from "cn"

// `required`'s asterisk is CSS-generated (after:content-['*']), not a real
// child node — a real text/DOM node (even aria-hidden) becomes part of the
// <label>'s matched text for exact-mode queries like Playwright's
// `getByLabel(..., { exact: true })`, silently breaking every such query
// against a required field (confirmed the hard way against this app's own
// E2E suite before landing on this fix).
function Label({ className, required, ...props }: React.ComponentProps<"label"> & { required?: boolean }) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        required && "after:ml-0.5 after:text-destructive after:content-['*']",
        className
      )}
      {...props}
    />
  )
}

export { Label }
