import { apiRoute, notFound, ok, pathId } from "@/lib/api/handler";
import { getAddOnRow } from "@/modules/api/queries";
import { addOnDto } from "@/modules/api/serializers";

export const GET = apiRoute<{ id: string }>({ scope: "addons:read" }, async (ctx, params) => {
  const addOn = await getAddOnRow(ctx.organizationId, pathId(params.id));
  if (!addOn) throw notFound("Add-on");
  return ok(addOnDto(addOn));
});
