import { prisma } from "@/lib/db";
import { identityPool } from "@/modules/auth/identity-db";
import { receiveBusinessCreated } from "@/modules/organisations/business-created";

// A product's signed "business created" message (plan step 4). Any known host; the signature is what is trusted, and it covers this route.
export async function POST(request: Request) {
  const rawBody = await request.text();
  return receiveBusinessCreated(
    {
      prisma,
      readPerson: async (subject) => {
        const { rows } = await identityPool().query<{ email: string; emailVerified: boolean }>(`select "email", "emailVerified" from "user" where "id" = $1`, [subject]);
        return rows[0] ?? null;
      },
    },
    { rawBody, headers: request.headers, method: request.method, url: request.url },
  );
}
