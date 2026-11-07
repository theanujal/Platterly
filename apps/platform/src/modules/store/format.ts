/** Rupee display for the Store: whole rupees when the amount is whole, two decimals otherwise. Amounts are shown, never recomputed. */
export const inr = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);

export type Interval = "MONTHLY" | "ANNUAL";
export const isInterval = (value: unknown): value is Interval => value === "MONTHLY" || value === "ANNUAL";

/** 18 Apr 2027. Dates in the sample data are ISO calendar dates, shown without any time zone shift. */
export const longDate = (iso: string) => !iso ? "—" : new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
