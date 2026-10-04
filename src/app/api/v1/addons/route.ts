import { apiRoute, page } from "@/lib/api/handler";
import { paging } from "@/lib/api/paging";
import { parseQuery } from "@/lib/api/query";
import { v } from "@/lib/api/schema";
import { pageAddOns } from "@/modules/api/queries";
import { addOnDto } from "@/modules/api/serializers";

export const GET = apiRoute({ scope: "addons:read" }, async (ctx) => {
  const q = parseQuery(ctx.url, { is_active: v.optional(v.boolean()), type: v.optional(v.oneOf(["LIVE_COUNTER", "SPECIAL_ADD_ON"] as const)) }, { booleans: ["is_active"] });
  const p = paging(q);
  const { rows, total } = await pageAddOns(ctx.organizationId, q, p);
  return page(rows.map(addOnDto), { page: p.page, perPage: p.perPage, total });
});
