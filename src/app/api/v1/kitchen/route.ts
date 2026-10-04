import { prisma } from "@/lib/db";
import { apiRoute, ok } from "@/lib/api/handler";

/** Who the API key is for: the kitchen and the permissions the key carries. Any valid key may call it. */
export const GET = apiRoute({ scope: null }, async (ctx) => {
  const kitchen = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { id: true, name: true, slug: true } });
  return ok({ id: kitchen.id, name: kitchen.name, slug: kitchen.slug, api_key: { name: ctx.keyName, scopes: ctx.scopes } });
});
