import { apiRoute, notFound, ok, pathId, readJson } from "@/lib/api/handler";
import { getCustomerRow } from "@/modules/api/queries";
import { customerDto } from "@/modules/api/serializers";
import { apiUpdateCustomer } from "@/modules/api/writes";

export const GET = apiRoute<{ id: string }>({ scope: "customers:read" }, async (ctx, params) => {
  const customer = await getCustomerRow(ctx.organizationId, pathId(params.id));
  if (!customer) throw notFound("Customer");
  return ok(customerDto(customer));
});

export const PATCH = apiRoute<{ id: string }>({ scope: "customers:write" }, async (ctx, params) => {
  const id = pathId(params.id);
  await apiUpdateCustomer(ctx.organizationId, id, await readJson(ctx.request));
  return ok(customerDto((await getCustomerRow(ctx.organizationId, id))!));
});
