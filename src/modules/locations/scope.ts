/**
 * Chunk 23 — the one place a "limit this to a location" query fragment is written, so Orders, the Dashboard, Reports and
 * Purchasing cannot drift apart. A falsy `locationId` (locations off, or "all locations") adds nothing.
 */
export type LocationId = string | null | undefined;

/** An order belongs to the location of its events. */
export const orderAt = (locationId: LocationId) => (locationId ? { events: { some: { assignedKitchenId: locationId } } } : {});

/** An event, menu selection or anything else that carries its own `assignedKitchenId`. */
export const eventAt = (locationId: LocationId) => (locationId ? { assignedKitchenId: locationId } : {});

/** An inventory item or purchase order tied to one location, or to none (shared by every location). */
export const sharedOrAt = (locationId: LocationId) => (locationId ? { OR: [{ kitchenId: null }, { kitchenId: locationId }] } : {});
