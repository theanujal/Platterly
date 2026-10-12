import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Error monitoring (AJ, 2026-10-12). Sentry is off unless a DSN is set, so dev, CI and tests never send anything. What is sent
 * is kept minimal: no cookies, no request bodies, no user details (this app holds customers' names, phone numbers and
 * addresses), and the e-mail / phone shapes are scrubbed from messages in case one slips into an error text.
 */
export function sentryOptions(dsn: string | undefined, env: { environment?: string; release?: string; app: string }) {
  return {
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    environment: env.environment || process.env.NODE_ENV || "development",
    release: env.release || undefined,
    initialScope: { tags: { app: env.app } },
    sendDefaultPii: false,
    // A small sample of normal requests for speed; every error is kept.
    tracesSampleRate: 0.05,
    beforeSend: scrubEvent,
  };
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;

export function scrubText(text: string): string {
  return text.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
}

/** Drops what could identify a customer or a session before an event leaves the server. */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) if (/^(cookie|authorization|x-forwarded-for|x-real-ip)$/i.test(name)) delete event.request.headers[name];
    }
  }
  delete event.user;
  if (event.message) event.message = scrubText(event.message);
  for (const exception of event.exception?.values ?? []) if (exception.value) exception.value = scrubText(exception.value);
  return event;
}
