import type { DispatchStatus, SetupStatus } from "@/generated/prisma/enums";

/** Plain-language labels and tones for logistics. Pure, shared by client and server. */
export const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  NOT_DISPATCHED: "Not dispatched",
  LOADING: "Loading",
  DISPATCHED: "On the way",
  DELIVERED: "Delivered",
};

export const DISPATCH_STATUS_TONE: Record<DispatchStatus, "neutral" | "warning" | "info" | "success"> = {
  NOT_DISPATCHED: "neutral",
  LOADING: "warning",
  DISPATCHED: "info",
  DELIVERED: "success",
};

export const SETUP_STATUS_LABEL: Record<SetupStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export const DISPATCH_STATUSES = Object.keys(DISPATCH_STATUS_LABEL) as DispatchStatus[];
export const SETUP_STATUSES = Object.keys(SETUP_STATUS_LABEL) as SetupStatus[];
