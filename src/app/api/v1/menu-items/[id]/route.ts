import { apiRoute, notFound, ok, pathId } from "@/lib/api/handler";
import { getMenuItemRow } from "@/modules/api/queries";
import { menuItemDto } from "@/modules/api/serializers";

export const GET = apiRoute<{ id: string }>({ scope: "menus:read" }, async (ctx, params) => {
  const item = await getMenuItemRow(ctx.organizationId, pathId(params.id));
  if (!item) throw notFound("Menu item");
  return ok({ ...menuItemDto(item), categories: item.categories.map((c) => ({ id: c.category.id, name: c.category.name })) });
});
