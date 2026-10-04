import { apiRoute, page } from "@/lib/api/handler";
import { paging } from "@/lib/api/paging";
import { parseQuery } from "@/lib/api/query";
import { v } from "@/lib/api/schema";
import { pageMenuItems } from "@/modules/api/queries";
import { menuItemDto } from "@/modules/api/serializers";

export const GET = apiRoute({ scope: "menus:read" }, async (ctx) => {
  const q = parseQuery(ctx.url, { is_active: v.optional(v.boolean()), food_type: v.optional(v.oneOf(["VEGETARIAN", "NON_VEGETARIAN"] as const)), category_id: v.optional(v.id()), search: v.optional(v.string({ min: 2, max: 100 })) }, { booleans: ["is_active"] });
  const p = paging(q);
  const { rows, total } = await pageMenuItems(ctx.organizationId, q, p);
  return page(rows.map(menuItemDto), { page: p.page, perPage: p.perPage, total });
});
