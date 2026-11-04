/**
 * Platform <-> product contract. The version rides in every event and command. Additive changes (new optional fields, new
 * event types) keep the number; a breaking change raises it and consumers refuse a version they do not know.
 */
export const PLATFORM_CONTRACT_VERSION = 1;

/** Delivery retry waits, in seconds: 1 min, 5 min, 30 min, 2 h, 12 h, 24 h. After the last one it repeats every 24 h. */
export const DELIVERY_BACKOFF_SECONDS = [60, 300, 1800, 7200, 43200, 86400] as const;

/** An event that is still undelivered after this long is parked as a dead letter and staff are alerted. */
export const DELIVERY_WINDOW_DAYS = 7;

/** Events held for a suspended product integration are kept this long before they are dead-lettered. */
export const HELD_EVENT_DAYS = 30;
