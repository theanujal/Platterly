import "server-only";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";

/**
 * Chunk 25 (security audit, P1) — a record may only point at records of its own kitchen. A foreign key alone does not
 * check that: without this, one kitchen could create an order that points at another kitchen's customer by id (from a
 * hand-made Server Action call or the public API) and then read that customer's name and phone through its own order.
 * Every module that stores a customer, event type or location id from the outside calls this first.
 */
export class ForeignReferenceError extends ValidationError {
  constructor(what: string) {
    super(`That ${what} doesn't exist.`);
    this.name = "ForeignReferenceError";
  }
}

export async function assertOwnedRefs(organizationId: string, refs: { customerId?: string | null; eventTypeId?: string | null; kitchenId?: string | null }): Promise<void> {
  const [customer, eventType, kitchen] = await Promise.all([
    refs.customerId ? prisma.customer.count({ where: { id: refs.customerId, organizationId } }) : 1,
    refs.eventTypeId ? prisma.eventType.count({ where: { id: refs.eventTypeId, organizationId } }) : 1,
    refs.kitchenId ? prisma.kitchen.count({ where: { id: refs.kitchenId, organizationId } }) : 1,
  ]);
  if (!customer) throw new ForeignReferenceError("customer");
  if (!eventType) throw new ForeignReferenceError("event type");
  if (!kitchen) throw new ForeignReferenceError("location");
}
