import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/monitoring/sentry-options";

// Error monitoring on the server (AJ, 2026-10-12). Off unless SENTRY_DSN is set.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sentryOptions(process.env.SENTRY_DSN, { app: "ops", release: process.env.APP_RELEASE }));
  }
}

export const onRequestError = Sentry.captureRequestError;
