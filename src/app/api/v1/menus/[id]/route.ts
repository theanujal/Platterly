import { apiRoute, notFound, ok, pathId } from "@/lib/api/handler";
import { getMenuRow } from "@/modules/api/queries";
import { menuDto } from "@/modules/api/serializers";

export const GET = apiRoute<{ id: string }>({ scope: "menus:read" }, async (ctx, params) => {
  const menu = await getMenuRow(ctx.organizationId, pathId(params.id));
  if (!menu) throw notFound("Menu");
  return ok({
    ...menuDto(menu),
    categories: menu.categoryAssignments.map((a) => ({ id: a.category.id, name: a.category.name })),
    items: menu.items.map((i) => ({ id: i.menuItem.id, name: i.menuItem.name, food_type: i.menuItem.foodType, price: Number(i.menuItem.price), is_active: i.menuItem.isActive })),
  });
});
