/**
 * A Date's own local calendar day as "YYYY-MM-DD". Never `toISOString().slice(0, 10)` for this: that goes through UTC and
 * gives yesterday between midnight and 5:30 AM in India (issue 87).
 */
export function toLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today in the browser's (or server's) own time zone, as "YYYY-MM-DD". */
export const todayLocalIso = () => toLocalIsoDate(new Date());

/** "22 Oct 2026" in the running time zone. */
export const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
