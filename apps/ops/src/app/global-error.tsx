"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// The last-resort error page: reports the error (when monitoring is on) and offers a reload. No details are shown.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: "#6b7280" }}>We have been told about it. Please reload the page.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: "1rem", height: 44, padding: "0 1rem", borderRadius: 10, border: 0, background: "#ff6900", color: "#fff", fontWeight: 500 }}>
          Reload
        </button>
      </body>
    </html>
  );
}
