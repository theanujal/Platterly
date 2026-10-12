import "server-only";
import { getSetting } from "./settings";
import { DEFAULT_TIME_ZONE, TIME_ZONE_SETTING_KEY, isValidTimeZone } from "@/lib/time/timezone";

/** The business's time zone (India unless it chose another). */
export async function getTenantTimeZone(organizationId: string): Promise<string> {
  const stored = await getSetting<string>(organizationId, TIME_ZONE_SETTING_KEY);
  return isValidTimeZone(stored) ? stored : DEFAULT_TIME_ZONE;
}
