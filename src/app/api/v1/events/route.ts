import { apiRoute, page } from "@/lib/api/handler";
import { paging } from "@/lib/api/paging";
import { parseQuery } from "@/lib/api/query";
import { v } from "@/lib/api/schema";
import { pageEvents } from "@/modules/api/queries";
import { eventDto } from "@/modules/api/serializers";

/** Events are created automatically from orders (an order with an Event Type), so the API only reads them. */
export const GET = apiRoute({ scope: "events:read" }, async (ctx) => {
  const q = parseQuery(ctx.url, { status: v.optional(v.oneOf(["PENDING", "PROCESSING", "COMPLETED", "CANCELLED"] as const)), customer_id: v.optional(v.id()), from: v.optional(v.date()), to: v.optional(v.date()) });
  const p = paging(q);
  const { rows, total } = await pageEvents(ctx.organizationId, q, p);
  return page(rows.map(eventDto), { page: p.page, perPage: p.perPage, total });
});
