import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/monitoring/sentry-options";

// Error monitoring in the browser. Off unless NEXT_PUBLIC_SENTRY_DSN is set at build time. No session replay, no cookies.
Sentry.init({ ...sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN, { app: "ops", release: process.env.NEXT_PUBLIC_APP_RELEASE }), tracesSampleRate: 0 });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
