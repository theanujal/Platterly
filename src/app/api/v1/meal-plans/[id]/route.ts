import { apiRoute, notFound, ok, pathId } from "@/lib/api/handler";
import { getMealPlanRow } from "@/modules/api/queries";
import { mealPlanDto } from "@/modules/api/serializers";

export const GET = apiRoute<{ id: string }>({ scope: "meal-plans:read" }, async (ctx, params) => {
  const plan = await getMealPlanRow(ctx.organizationId, pathId(params.id));
  if (!plan) throw notFound("Meal plan");
  return ok(mealPlanDto(plan));
});
