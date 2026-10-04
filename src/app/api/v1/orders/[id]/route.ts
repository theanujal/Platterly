import { apiRoute, notFound, ok, pathId, readJson } from "@/lib/api/handler";
import { getOrderRow, mealPlansOfOrder } from "@/modules/api/queries";
import { mealPlanDto, orderDto } from "@/modules/api/serializers";
import { apiUpdateOrder } from "@/modules/api/writes";

const detail = async (organizationId: string, id: string) => {
  const [row, plans] = await Promise.all([getOrderRow(organizationId, id), mealPlansOfOrder(organizationId, id)]);
  if (!row) throw notFound("Order");
  return { ...orderDto(row), meal_plans: plans.map(mealPlanDto) };
};

export const GET = apiRoute<{ id: string }>({ scope: "orders:read" }, async (ctx, params) => ok(await detail(ctx.organizationId, pathId(params.id))));

/** Change an order's details. The status, advance, discounts and charges are not changeable here. */
export const PATCH = apiRoute<{ id: string }>({ scope: "orders:write" }, async (ctx, params) => {
  const id = pathId(params.id);
  await apiUpdateOrder(ctx.organizationId, id, await readJson(ctx.request));
  return ok(await detail(ctx.organizationId, id));
});
