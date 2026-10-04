"use client";

import { useEffect } from "react";

/**
 * Tells Platterly this storefront was opened, once per browser session (a reload is not a new visit), and keeps the
 * visit id so the enquiry form can say where the lead came from. Sends only what the page itself knows: the page the
 * visitor came from, whether the storefront is inside a frame, and the link's `?src=` tag.
 */
export function VisitBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `pv:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      // Marked before the request goes out, so an effect that runs twice (development) or two quick reloads send one.
      sessionStorage.setItem(key, "pending");
    } catch {
      /* private mode: report anyway */
    }
    const embedded = window.self !== window.top;
    const ancestor = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins?.[0] ?? null;
    const src = new URLSearchParams(window.location.search).get("src");
    fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, src, referrer: document.referrer || null, embedded, ancestor }),
      keepalive: true,
    })
      .then((response) => response.json())
      .then((body: { visitId: string | null }) => {
        try {
          sessionStorage.setItem(key, body.visitId ?? "none");
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, [slug]);
  return null;
}
