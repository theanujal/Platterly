"use server";

import { revalidatePath } from "next/cache";
import { markAllRead, markRead } from "@/modules/notifications/inbox";
import { cookies } from "next/headers";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { ACTIVE_LOCATION_COOKIE, getActiveLocation } from "@/modules/locations/active-location";
import { prisma } from "@/lib/db";
import { listOrders } from "@/modules/orders/order";
import type { OrderStatus } from "@/generated/prisma/enums";

export interface GlobalSearchResult {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  total: number;
  customerName: string;
  customerPhone: string;
}

// Backs the app shell's header search bar (client, order number, phone) —
// deliberately scoped to Order, not Customer, since this is a
// "find the order I'm looking for" search, not a CRM lookup.
export async function searchOrdersAction(query: string): Promise<GlobalSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["view"] }, organizationId);

  const orders = await listOrders(organizationId, { search: trimmed, take: 8 });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: Number(order.total),
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
  }));
}

// The header bell. Only ever touches the signed-in person's own notifications (see modules/notifications/inbox.ts).
export async function markNotificationReadAction(id: string): Promise<void> {
  const { session, organizationId } = await requireActiveOrganization();
  await markRead(organizationId, session.user.id, id);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const { session, organizationId } = await requireActiveOrganization();
  await markAllRead(organizationId, session.user.id);
  revalidatePath("/", "layout");
}

/**
 * Chunk 23 — the header's location switcher. Owner only, and only while multiple locations are on; a location from
 * another kitchen is refused. Null means "all locations".
 */
export async function setActiveLocationAction(locationId: string | null): Promise<void> {
  const { session, organizationId } = await requireActiveOrganization();
  const active = await getActiveLocation(organizationId, session.user.id);
  if (!active.canSwitch) return;
  const cookieStore = await cookies();
  if (locationId === null) {
    cookieStore.delete(ACTIVE_LOCATION_COOKIE);
  } else {
    const location = await prisma.kitchen.findFirst({ where: { id: locationId, organizationId }, select: { id: true } });
    if (!location) return;
    cookieStore.set(ACTIVE_LOCATION_COOKIE, location.id, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  }
  revalidatePath("/", "layout");
}
