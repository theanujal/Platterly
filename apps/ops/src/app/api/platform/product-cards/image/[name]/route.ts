import { handleProductCardImageRequest } from "@/modules/product-cards/cards";

export const dynamic = "force-dynamic";

/** GET: one uploaded card picture (only one a card uses) for the Platform's Account. Signed read, signed answer. */
export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  return handleProductCardImageRequest(request, (await context.params).name);
}
