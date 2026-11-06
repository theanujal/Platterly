import type { Sender } from "./deliver";

// The real signed sender to a product is checkpoint IC1 (W3) and is not built. Until then there is NO sender, so the cron route refuses to run
// rather than failing every event into the dead-letter state.
export function getSender(): Sender | null {
  return null;
}
