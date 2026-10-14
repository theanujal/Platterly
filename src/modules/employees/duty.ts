import type { StaffDuty } from "@/generated/prisma/enums";

/** Plain-language duty names, in the order the pickers show them. Pure, so client and server share it. */
export const STAFF_DUTY_LABEL: Record<StaffDuty, string> = {
  EVENT_MANAGER: "Event Manager",
  KITCHEN: "Cooking",
  SERVING: "Serving",
  DELIVERY: "Delivery",
  SETUP: "Setup",
  STORE: "Store",
};

/**
 * The duties a kitchen enters as a number (AJ, 2026-10-14): Cooking, Serving, Setup. The Event Manager is a typed name
 * instead, and Delivery and Store are not staffed from here (the enum values stay so older records still read).
 */
/** Every duty the database knows, for older assignments. */
export const ALL_STAFF_DUTIES = Object.keys(STAFF_DUTY_LABEL) as StaffDuty[];

export const STAFF_DUTIES: StaffDuty[] = ["KITCHEN", "SERVING", "SETUP"];

export const isStaffDuty = (value: string): value is StaffDuty => (STAFF_DUTIES as string[]).includes(value);
export const isAnyStaffDuty = (value: string): value is StaffDuty => (ALL_STAFF_DUTIES as string[]).includes(value);

export type StaffingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export const STAFFING_STATUS_LABEL: Record<StaffingStatus, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETE: "Complete" };

/** Nothing entered is Not started; a named Event Manager plus Cooking and Serving numbers is Complete (Setup is optional); anything between is In progress. */
export function staffingStatus(eventManagerName: string | null, counts: Partial<Record<StaffDuty, number>>): StaffingStatus {
  const hasManager = Boolean(eventManagerName?.trim());
  const entered = STAFF_DUTIES.some((d) => (counts[d] ?? 0) > 0);
  if (!hasManager && !entered) return "NOT_STARTED";
  return hasManager && (counts.KITCHEN ?? 0) > 0 && (counts.SERVING ?? 0) > 0 ? "COMPLETE" : "IN_PROGRESS";
}

/** Day windows the Staff page can show; the first is the default. Plain module so server and client share it. */
export const SCHEDULE_RANGES = [3, 7, 14] as const;
