import { prisma } from "@/lib/db";
import { receiveBusinessRenamed } from "@/modules/organisations/business-renamed";

// A product's signed "business renamed" message. Any known host; the signature is what is trusted, and it covers this route.
export async function POST(request: Request) {
  const rawBody = await request.text();
  return receiveBusinessRenamed({ prisma }, { rawBody, headers: request.headers, method: request.method, url: request.url });
}
