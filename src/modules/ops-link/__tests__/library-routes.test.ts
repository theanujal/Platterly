import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, parseLibraryCandidates, requestTarget, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { GET as candidatesGET } from "@/app/api/ops/library/candidates/route";
import { POST as decisionsPOST } from "@/app/api/ops/library/decisions/route";

/** The library review routes: signed in both directions, minimal data out, safe to repeat, nothing changes without a valid signature. */
const COMMAND_SECRET = "opssec_library_command";
const EVENT_SECRET = "opssec_library_event";
const saved: Record<string, string | undefined> = {};
const names: string[] = [];

const get = (secret = COMMAND_SECRET) => candidatesGET(new Request("http://127.0.0.1:3000/api/ops/library/candidates", { headers: signedHeaders(secret, newId("command"), "", { target: requestTarget("GET", "http://127.0.0.1:3000/api/ops/library/candidates") }) }));
const post = (body: unknown, secret = COMMAND_SECRET) => {
  const text = JSON.stringify(body);
  return decisionsPOST(new Request("http://127.0.0.1:3000/api/ops/library/decisions", { method: "POST", headers: signedHeaders(secret, newId("command"), text, { target: requestTarget("POST", "http://127.0.0.1:3000/api/ops/library/decisions") }), body: text }));
};
const replyText = async (res: Response) => {
  const text = await res.text();
  // the product signs its answers: ops checks it with the "event" secret
  expect(verifyRequest([EVENT_SECRET], res.headers, text).ok).toBe(true);
  return text;
};

beforeAll(() => {
  for (const k of ["OPS_BASE_URL", "OPS_EVENT_SECRET", "OPS_COMMAND_SECRETS", "OPS_PRODUCT_KEY"]) saved[k] = process.env[k];
});
beforeEach(() => {
  Object.assign(process.env, { OPS_BASE_URL: "http://127.0.0.1:9", OPS_EVENT_SECRET: EVENT_SECRET, OPS_COMMAND_SECRETS: COMMAND_SECRET, OPS_PRODUCT_KEY: "catering" });
});
afterEach(async () => {
  await prisma.libraryCandidate.deleteMany({ where: { name: { in: names } } });
  await prisma.systemFoodItem.deleteMany({ where: { name: { in: names } } });
  names.length = 0;
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function candidate(name: string, kitchenCount = 3) {
  names.push(name);
  return prisma.libraryCandidate.create({ data: { kind: "FOOD_ITEM", key: name.toLowerCase(), name, categoryName: "Starters", foodType: "VEGETARIAN", kitchenCount } });
}

describe("GET /api/ops/library/candidates", () => {
  it("answers 401 without a valid signature and 404 when the link is off", async () => {
    expect((await get("wrong-secret")).status).toBe(401);
    delete process.env.OPS_BASE_URL;
    expect((await get()).status).toBe(404);
  });

  it("lists pending candidates with enough kitchens, signed, and the contract accepts them", async () => {
    const shown = `Route Shown ${crypto.randomUUID().slice(0, 6)}`;
    const few = `Route Few ${crypto.randomUUID().slice(0, 6)}`;
    await candidate(shown, 3);
    await candidate(few, 1);
    const res = await get();
    expect(res.status).toBe(200);
    const parsed = parseLibraryCandidates(JSON.parse(await replyText(res)));
    expect(parsed.ok).toBe(true);
    const list = parsed.ok ? parsed.value.candidates.map((c) => c.name) : [];
    expect(list).toContain(shown);
    expect(list).not.toContain(few);
  });
});

describe("POST /api/ops/library/decisions", () => {
  it("applies a decision once, answers 'already' the second time, and signs both answers", async () => {
    const name = `Route Approve ${crypto.randomUUID().slice(0, 6)}`;
    const c = await candidate(name);
    const body = { candidateId: c.id, action: "approve", entry: { name, categoryName: "Starters", foodType: "VEGETARIAN", unit: null, description: null } };
    const first = await post(body);
    expect(first.status).toBe(200);
    expect(JSON.parse(await replyText(first))).toEqual({ result: "applied" });
    const second = await post(body);
    expect(JSON.parse(await replyText(second))).toEqual({ result: "already" });
    expect(await prisma.systemFoodItem.count({ where: { name } })).toBe(1);
  });

  it("refuses a bad signature, a bad body, an unknown candidate and a name the library already has", async () => {
    const name = `Route Dup ${crypto.randomUUID().slice(0, 6)}`;
    const c = await candidate(name);
    expect((await post({ candidateId: c.id, action: "reject" }, "wrong-secret")).status).toBe(401);
    expect((await post({ candidateId: c.id, action: "explode" })).status).toBe(400);
    expect((await post({ candidateId: "nope", action: "reject" })).status).toBe(404);
    await prisma.systemFoodItem.create({ data: { name, foodType: "VEGETARIAN", categoryName: "Starters" } });
    const res = await post({ candidateId: c.id, action: "approve" });
    expect(res.status).toBe(409);
    expect(JSON.parse(await replyText(res)).error).toContain("already in the library");
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PENDING"); // nothing changed
  });
});

describe("/api/ops/library/entries", () => {
  const entriesGet = async (kind: string, secret = COMMAND_SECRET) => {
    const { GET } = await import("@/app/api/ops/library/entries/route");
    const url = `http://127.0.0.1:3000/api/ops/library/entries?kind=${kind}`;
    return GET(new Request(url, { headers: signedHeaders(secret, newId("command"), "", { target: requestTarget("GET", url) }) }));
  };
  const entriesPost = async (body: unknown, secret = COMMAND_SECRET) => {
    const { POST } = await import("@/app/api/ops/library/entries/route");
    const text = JSON.stringify(body);
    return POST(new Request("http://127.0.0.1:3000/api/ops/library/entries", { method: "POST", headers: signedHeaders(secret, newId("command"), text, { target: requestTarget("POST", "http://127.0.0.1:3000/api/ops/library/entries") }), body: text }));
  };

  it("needs a valid signature and a valid kind, and signs its answers", async () => {
    expect((await entriesGet("FOOD_ITEM", "wrong")).status).toBe(401);
    expect((await entriesGet("PHOTO")).status).toBe(400);
    const ok = await entriesGet("INGREDIENT");
    expect(ok.status).toBe(200);
    const parsed = JSON.parse(await replyText(ok));
    expect(Array.isArray(parsed.entries)).toBe(true);
  });

  it("lists the library's categories", async () => {
    const res = await entriesGet("CATEGORY");
    expect(res.status).toBe(200);
    const parsed = JSON.parse(await replyText(res));
    expect(parsed.entries.map((e: { name: string }) => e.name)).toEqual(expect.arrayContaining(["Starters", "Main Course"]));
    expect(parsed.entries[0]).toMatchObject({ kind: "CATEGORY", foodType: null, unit: null, isActive: true });
  });

  it("applies one signed change, answers 409 for a taken name, and 401 without a signature", async () => {
    const a = await candidate("Route Entry A");
    await prisma.libraryCandidate.delete({ where: { id: a.id } });
    const one = await prisma.systemFoodItem.create({ data: { name: "Route Entry One", foodType: "VEGETARIAN", categoryName: "Starters" } });
    const two = await prisma.systemFoodItem.create({ data: { name: "Route Entry Two", foodType: "VEGETARIAN", categoryName: "Starters" } });
    names.push(one.name, two.name, "Route Entry Renamed");
    expect((await entriesPost({ id: one.id, kind: "FOOD_ITEM", isActive: false }, "wrong")).status).toBe(401);
    expect(JSON.parse(await replyText(await entriesPost({ id: one.id, kind: "FOOD_ITEM", isActive: false }))).result).toBe("applied");
    expect((await prisma.systemFoodItem.findUniqueOrThrow({ where: { id: one.id } })).isActive).toBe(false);
    expect((await entriesPost({ id: two.id, kind: "FOOD_ITEM", name: "route entry one" })).status).toBe(409);
    expect((await entriesPost({ id: two.id, kind: "FOOD_ITEM", foodType: "SOUR" })).status).toBe(400);
  });
});
