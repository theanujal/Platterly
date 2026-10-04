import { apiRoute, page } from "@/lib/api/handler";
import { paging } from "@/lib/api/paging";
import { parseQuery } from "@/lib/api/query";
import { v } from "@/lib/api/schema";
import { pageMenus } from "@/modules/api/queries";
import { menuDto } from "@/modules/api/serializers";

export const GET = apiRoute({ scope: "menus:read" }, async (ctx) => {
  const q = parseQuery(ctx.url, { is_active: v.optional(v.boolean()), menu_type: v.optional(v.oneOf(["VEGETARIAN", "NON_VEGETARIAN"] as const)) }, { booleans: ["is_active"] });
  const p = paging(q);
  const { rows, total } = await pageMenus(ctx.organizationId, q, p);
  return page(rows.map(menuDto), { page: p.page, perPage: p.perPage, total });
});
