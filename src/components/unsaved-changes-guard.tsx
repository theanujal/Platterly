"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * The unsaved-edit guard for a full page form (the drawers have theirs built in, see FormDrawer; AJ, 2026-10-14).
 * While `dirty`: closing or reloading the tab asks the browser's own question, and clicking any in-app link (sidebar,
 * breadcrumbs, the page's own Back button through `requestLeave`) asks "Discard your changes?" first. Render `dialog`
 * anywhere in the page. The browser's Back button cannot be intercepted by Next.js and is not covered.
 */
export function useUnsavedChangesGuard(dirty: boolean, what: string) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    // Capture phase, so this runs before Next's own link handling.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // a real page load: the browser asks by itself
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page (#anchor)
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const dialog = (
    <ConfirmDialog
      open={pendingHref !== null}
      onOpenChange={(open) => !open && setPendingHref(null)}
      title={`Discard your changes to this ${what}?`}
      description="What you changed has not been saved and will be lost."
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onConfirm={() => {
        const href = pendingHref;
        dirtyRef.current = false;
        setPendingHref(null);
        if (href) router.push(href);
      }}
    />
  );

  return {
    /** Go to `href`, asking first when there are unsaved changes. */
    requestLeave: (href: string) => (dirtyRef.current ? setPendingHref(href) : router.push(href)),
    dialog,
  };
}
