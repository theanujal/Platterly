import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { runDeliveryBatch } from "@/modules/outbox/deliver";
import { getSender } from "@/modules/outbox/sender";

// F3.3.2 cron entry for the outbox worker. POST only; callers send `Authorization: Bearer <CRON_SECRET>`. With no sender configured (real
// delivery is IC1 / W3) it answers 503 and touches no event, so nothing is consumed or dead-lettered by mistake.
const BATCH = 25;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: "unauthorised" }, { status: 401 });
  const sender = getSender();
  if (!sender) return Response.json({ error: "delivery_not_configured" }, { status: 503 });
  const result = await runDeliveryBatch(prisma, sender, { limit: BATCH });
  return Response.json(result);
}
