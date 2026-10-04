import { apiRoute, notFound, ok, pathId } from "@/lib/api/handler";
import { getEventRow, mealPlansOfOrder } from "@/modules/api/queries";
import { mealPlanDto } from "@/modules/api/serializers";

/** The meals planned for an event: they live on the event's order. */
export const GET = apiRoute<{ id: string }>({ scope: "meal-plans:read" }, async (ctx, params) => {
  const event = await getEventRow(ctx.organizationId, pathId(params.id));
  if (!event) throw notFound("Event");
  return ok(event.orderId ? (await mealPlansOfOrder(ctx.organizationId, event.orderId)).map(mealPlanDto) : []);
});
