import { apiRoute, created, page, readJson } from "@/lib/api/handler";
import { withIdempotency } from "@/lib/api/idempotency";
import { paging } from "@/lib/api/paging";
import { parseQuery } from "@/lib/api/query";
import { v } from "@/lib/api/schema";
import { pageCustomers, getCustomerRow } from "@/modules/api/queries";
import { customerDto } from "@/modules/api/serializers";
import { apiCreateCustomer } from "@/modules/api/writes";

export const GET = apiRoute({ scope: "customers:read" }, async (ctx) => {
  const q = parseQuery(ctx.url, { status: v.optional(v.oneOf(["LEAD", "CUSTOMER"] as const)), search: v.optional(v.string({ min: 2, max: 100 })) });
  const p = paging(q);
  const { rows, total } = await pageCustomers(ctx.organizationId, q, p);
  return page(rows.map(customerDto), { page: p.page, perPage: p.perPage, total });
});

export const POST = apiRoute({ scope: "customers:write" }, async (ctx) => {
  const body = await readJson(ctx.request);
  return withIdempotency(ctx, body, async () => {
    const id = await apiCreateCustomer(ctx.organizationId, body);
    return created(customerDto((await getCustomerRow(ctx.organizationId, id))!));
  });
});
