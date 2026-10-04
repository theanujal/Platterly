import type { StaffDuty } from "@/generated/prisma/enums";

/** Plain-language duty names, in the order the pickers show them. Pure, so client and server share it. */
export const STAFF_DUTY_LABEL: Record<StaffDuty, string> = {
  EVENT_MANAGER: "Event Manager",
  KITCHEN: "Kitchen",
  SERVING: "Serving",
  DELIVERY: "Delivery",
  SETUP: "Setup",
  STORE: "Store",
};

export const STAFF_DUTIES = Object.keys(STAFF_DUTY_LABEL) as StaffDuty[];

export const isStaffDuty = (value: string): value is StaffDuty => (STAFF_DUTIES as string[]).includes(value);
