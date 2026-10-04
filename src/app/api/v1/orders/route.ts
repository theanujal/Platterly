import { apiRoute, created, page, readJson } from "@/lib/api/handler";
import { withIdempotency } from "@/lib/api/idempotency";
import { paging } from "@/lib/api/paging";
import { parseQuery } from "@/lib/api/query";
import { v } from "@/lib/api/schema";
import { getOrderRow, mealPlansOfOrder, pageOrders } from "@/modules/api/queries";
import { mealPlanDto, orderDto } from "@/modules/api/serializers";
import { apiCreateOrder } from "@/modules/api/writes";

const STATUSES = ["PENDING_REVIEW", "AWAITING_CUSTOMER_APPROVAL", "APPROVED", "SENT_TO_KITCHEN", "COMPLETED", "CANCELLED"] as const;

export const GET = apiRoute({ scope: "orders:read" }, async (ctx) => {
  const q = parseQuery(ctx.url, { status: v.optional(v.oneOf(STATUSES)), customer_id: v.optional(v.id()), event_from: v.optional(v.date()), event_to: v.optional(v.date()) });
  const p = paging(q);
  const { rows, total } = await pageOrders(ctx.organizationId, q, p);
  return page(rows.map(orderDto), { page: p.page, perPage: p.perPage, total });
});

/** Place an order. Send an `Idempotency-Key` header so a retried request cannot create a second order. */
export const POST = apiRoute({ scope: "orders:write" }, async (ctx) => {
  const body = await readJson(ctx.request);
  return withIdempotency(ctx, body, async () => {
    const id = await apiCreateOrder(ctx.organizationId, body);
    const [row, plans] = await Promise.all([getOrderRow(ctx.organizationId, id), mealPlansOfOrder(ctx.organizationId, id)]);
    return created({ ...orderDto(row!), meal_plans: plans.map(mealPlanDto) });
  });
});
