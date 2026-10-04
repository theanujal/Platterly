import { apiRoute, notFound, ok, pathId } from "@/lib/api/handler";
import { getEventRow } from "@/modules/api/queries";
import { eventDto } from "@/modules/api/serializers";

export const GET = apiRoute<{ id: string }>({ scope: "events:read" }, async (ctx, params) => {
  const event = await getEventRow(ctx.organizationId, pathId(params.id));
  if (!event) throw notFound("Event");
  return ok(eventDto(event));
});
