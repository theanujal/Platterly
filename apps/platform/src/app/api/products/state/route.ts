import { prisma } from "@/lib/db";
import { answerStatePull } from "@/modules/organisations/business-state";

// A product's signed pull of one business's current state (F6.2.2). Any known host; the signature is what is trusted, and it covers this route and its query.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return answerStatePull({ prisma }, { headers: request.headers, method: request.method, url: request.url });
}
