/** Every business starts on India time (AJ, 2026-10-12); a business abroad can pick its own in Settings. */
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

export const TIME_ZONE_SETTING_KEY = "timezone";

export const TIME_ZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Asia/Kolkata", label: "India (IST, UTC+5:30)" },
  { value: "Asia/Dubai", label: "Dubai (GST, UTC+4)" },
  { value: "Asia/Singapore", label: "Singapore (UTC+8)" },
  { value: "Asia/Colombo", label: "Sri Lanka (UTC+5:30)" },
  { value: "Asia/Kathmandu", label: "Nepal (UTC+5:45)" },
  { value: "Asia/Dhaka", label: "Bangladesh (UTC+6)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "America/New_York", label: "New York (ET)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { value: "Australia/Sydney", label: "Sydney (AET)" },
];

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Midnight (UTC) of today's calendar day in the given zone. Event dates are stored as UTC midnight of their day, so
 * this compares like with like (the same idea as the old India-only version, for any zone).
 */
export function todayStartInZone(now: Date, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(pick("year"), pick("month") - 1, pick("day")));
}
