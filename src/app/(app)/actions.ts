"use server";

import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
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
