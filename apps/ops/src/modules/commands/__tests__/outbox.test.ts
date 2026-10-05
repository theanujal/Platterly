import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders, verifyRequest, type EntitlementSnapshot } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct, rotateSecrets } from "@/modules/registry/products";
import { MAX_ATTEMPTS, OutboxError, RETRY_DELAYS_SECONDS, attemptCommand, classify, enqueueCommand, runDueCommands, sendCommand } from "../outbox";
import { GET as cronGET } from "@/app/api/cron/route";

const KEY = "cmdtest";
let server: Server;
let baseUrl: string;
let outboundSecret = "";
let inboundSecret = "";
let received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
let behaviour: "ok" | "unsigned" | "5xx" | "404" | "501" | "slow" = "ok";

const businessId = `biz_${"a".repeat(32)}`;

function snapshot(version = 1): EntitlementSnapshot {
  return { businessId, productKey: KEY, subscriptionId: newId("subscription"), version, plan: { code: "p", name: "P" }, status: "ACTIVE", interval: null, currentPeriodEnd: null, trialEndsAt: null, entitlements: {}, issuedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 86_400_000).toISOString() };
}
const suspend = (reason = "r") => ({ productKey: KEY, command: { type: "business.suspend" as const, businessId, payload: { reason } } });

async function clean() {
  await prisma.product.deleteMany({ where: { key: KEY } });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      if (behaviour === "5xx") return void ((res.statusCode = 503), res.end("{}"));
      if (behaviour === "404") return void ((res.statusCode = 404), res.end(JSON.stringify({ ok: false, error: "unknown_business" })));
      if (behaviour === "501") return void ((res.statusCode = 501), res.end(JSON.stringify({ ok: false, error: "not_supported_yet" })));
      const reply = JSON.stringify({ ok: true, applied: true });
      const headers = behaviour === "unsigned" ? {} : signedHeaders(inboundSecret, newId("command"), reply);
      res.writeHead(200, headers);
      res.end(reply);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await clean();
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(async () => {
  await clean();
  received = [];
  behaviour = "ok";
  const { secrets } = await registerProduct({ key: KEY, name: "Cmd Test", baseUrl, actorUserId: null });
  outboundSecret = secrets.outbound;
  inboundSecret = secrets.inbound;
});
afterEach(clean);

describe("command outbox", () => {
  it("sends a command signed with the outbound secret, with its id as the signed id, and stores the verified reply", async () => {
    const id = (await sendCommand(suspend("non-payment")))!;
    expect(received).toHaveLength(1);
    const verified = verifyRequest([outboundSecret], new Headers(received[0].headers as Record<string, string>), received[0].body);
    expect(verified).toMatchObject({ ok: true, id });
    expect(JSON.parse(received[0].body)).toMatchObject({ commandId: id, businessId, type: "business.suspend", payload: { reason: "non-payment" } });
    expect(await prisma.outboundCommand.findUniqueOrThrow({ where: { commandId: id } })).toMatchObject({ status: "SENT", attempts: 1, lastStatusCode: 200, response: { ok: true, applied: true } });
    expect(await attemptCommand(id)).toBe("skipped");
  });

  it("does not count a success the product did not sign", async () => {
    behaviour = "unsigned";
    const id = (await sendCommand(suspend()))!;
    const row = await prisma.outboundCommand.findUniqueOrThrow({ where: { commandId: id } });
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toMatch(/not signed correctly/);
  });

  it("retries a 5xx on the 1m, 5m, 30m, 2h, 12h schedule, then gives up", async () => {
    behaviour = "5xx";
    const id = (await enqueueCommand(suspend()))!;
    let now = new Date();
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      expect(await attemptCommand(id, now)).toBe("retry");
      const row = await prisma.outboundCommand.findUniqueOrThrow({ where: { commandId: id } });
      expect(row.status).toBe("PENDING");
      expect(Math.abs(row.nextAttemptAt!.getTime() - Date.now() - RETRY_DELAYS_SECONDS[attempt - 1] * 1000)).toBeLessThan(5000);
      now = new Date(row.nextAttemptAt!.getTime() + 1000);
    }
    expect(await attemptCommand(id, now)).toBe("failed");
    expect(await prisma.outboundCommand.findUniqueOrThrow({ where: { commandId: id } })).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });
  });

  it("fails at once on an unknown business or a not-yet-supported command, keeping the product's answer", async () => {
    behaviour = "404";
    const a = (await sendCommand(suspend()))!;
    expect(await prisma.outboundCommand.findUniqueOrThrow({ where: { commandId: a } })).toMatchObject({ status: "FAILED", attempts: 1, lastStatusCode: 404, response: { error: "unknown_business" } });
    behaviour = "501";
    const b = (await sendCommand(suspend("again")))!;
    expect(await prisma.outboundCommand.findUniqueOrThrow({ where: { commandId: b } })).toMatchObject({ status: "FAILED", response: { error: "not_supported_yet" } });
  });

  it("survives the product being down, and a scheduled run sends what has come due", async () => {
    await prisma.product.update({ where: { key: KEY }, data: { baseUrl: "http://127.0.0.1:9" } });
    const id = (await sendCommand(suspend()))!;
    const waiting = await prisma.outboundCommand.findUniqueOrThrow({ where: { commandId: id } });
    expect(waiting).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(waiting.lastError).toMatch(/Could not reach/);

    await prisma.product.update({ where: { key: KEY }, data: { baseUrl } });
    expect(await runDueCommands(new Date(), 50, KEY)).toBe(0); // not due yet (1 minute)
    expect(await runDueCommands(new Date(Date.now() + 2 * 60_000), 50, KEY)).toBe(1);
    expect((await prisma.outboundCommand.findUniqueOrThrow({ where: { commandId: id } })).status).toBe("SENT");
  });

  it("two workers never send the same command together", async () => {
    const id = (await enqueueCommand(suspend()))!;
    const results = await Promise.all([attemptCommand(id), attemptCommand(id)]);
    expect(results.sort()).toEqual(["sent", "skipped"]);
    expect(received).toHaveLength(1);
  });

  it("queues a dedupe key once", async () => {
    const input = { ...suspend(), dedupeKey: `snapshot:${businessId}:7` };
    expect(await enqueueCommand(input)).toBeTruthy();
    expect(await enqueueCommand(input)).toBeNull();
  });

  it("refuses an invalid command, an unknown product, and (once the manifest is known) an entitlement the product does not declare", async () => {
    await expect(enqueueCommand({ productKey: "cmdtest-nope", command: { type: "business.suspend", businessId, payload: { reason: "r" } } })).rejects.toThrow(OutboxError);
    await expect(enqueueCommand({ productKey: KEY, command: { type: "business.suspend", businessId: "bad", payload: { reason: "r" } } })).rejects.toThrow(/Invalid command/);
    await expect(enqueueCommand({ productKey: KEY, command: { type: "business.suspend", businessId, payload: { reason: "" } } })).rejects.toThrow(/reason/);

    await prisma.product.update({ where: { key: KEY }, data: { manifest: { entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }] } } });
    const odd = { ...snapshot(), entitlements: { surprise: 1 } };
    await expect(enqueueCommand({ productKey: KEY, command: { type: "snapshot.push", businessId, payload: { snapshot: odd } } })).rejects.toThrow(/unknown entitlement/);
    expect(await enqueueCommand({ productKey: KEY, command: { type: "snapshot.push", businessId, payload: { snapshot: { ...snapshot(), entitlements: { maxCustomers: 5 } } } } })).toBeTruthy();
  });

  it("fails a command for a disabled product, and uses the new secret after a rotation", async () => {
    await prisma.product.update({ where: { key: KEY }, data: { status: "DISABLED" } });
    const a = (await sendCommand(suspend()))!;
    expect((await prisma.outboundCommand.findUniqueOrThrow({ where: { commandId: a } })).lastError).toMatch(/disabled/);
    expect(received).toHaveLength(0);

    await prisma.product.update({ where: { key: KEY }, data: { status: "ACTIVE" } });
    const fresh = await rotateSecrets(KEY, null);
    inboundSecret = fresh.inbound;
    const b = (await sendCommand(suspend("after rotation")))!;
    expect(verifyRequest([fresh.outbound], new Headers(received[0].headers as Record<string, string>), received[0].body)).toMatchObject({ ok: true, id: b });
  });

  it("classifies statuses", () => {
    expect(classify(200).kind).toBe("sent");
    expect(classify(204).kind).toBe("sent");
    for (const s of [500, 503, 408, 429]) expect(classify(s).kind).toBe("retry");
    for (const s of [400, 401, 404, 409, 501, 302]) expect(classify(s).kind).toBe("failed");
  });
});

describe("the ops cron", () => {
  const call = (secret?: string) => cronGET(new Request(`http://127.0.0.1:3200/api/cron?product=${KEY}`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} }));
  const saved = process.env.CRON_SECRET;
  afterAll(() => {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  });

  it("answers 404 without a secret configured, 401 for a wrong one, and runs for the right one", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("anything")).status).toBe(404);
    process.env.CRON_SECRET = "cron-test-secret-123";
    expect((await call()).status).toBe(401);
    expect((await call("wrong")).status).toBe(401);
    const ok = await call("cron-test-secret-123");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ commandsSent: expect.any(Number) });
  });

  it("sends due commands when it runs", async () => {
    process.env.CRON_SECRET = "cron-test-secret-123";
    const id = (await enqueueCommand(suspend()))!;
    const body = await (await call("cron-test-secret-123")).json();
    expect(body.commandsSent).toBeGreaterThanOrEqual(1);
    expect((await prisma.outboundCommand.findUniqueOrThrow({ where: { commandId: id } })).status).toBe("SENT");
  });
});
