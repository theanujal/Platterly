import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { countPending, decideCandidate, listCandidates, pullLibraryCandidates, refreshLibraryCandidates, LibraryReviewError } from "../library";

const KEY = "libtest";
let server: Server;
let baseUrl = "";
let outboundSecret = "";
let inboundSecret = "";
let seen: { method: string; path: string; verified: boolean; body: string }[] = [];
let answer: { status: number; body: string; sign: boolean } = { status: 200, body: "", sign: true };

const cand = (id: string, over: Record<string, unknown> = {}) => ({ id, kind: "FOOD_ITEM", name: `Dish ${id}`, categoryName: "Starters", foodType: "VEGETARIAN", unit: null, kitchenCount: 3, suggestedMatchId: null, suggestedMatchName: null, photoUrl: null, updatedAt: "2026-10-11T00:00:00.000Z", ...over });

async function clean() {
  await prisma.notification.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } }); // candidates cascade
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      seen.push({ method: req.method!, path: req.url!, verified: verifyRequest([outboundSecret], new Headers(req.headers as Record<string, string>), body).ok, body });
      res.writeHead(answer.status, answer.sign ? signedHeaders(inboundSecret, newId("command"), answer.body) : {});
      res.end(answer.body);
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
  seen = [];
  answer = { status: 200, body: JSON.stringify({ candidates: [cand("a"), cand("b", { kind: "INGREDIENT", categoryName: "Dairy", foodType: null, unit: "kg" })] }), sign: true };
  const { secrets } = await registerProduct({ key: KEY, name: "Lib Test", baseUrl, actorUserId: null });
  outboundSecret = secrets.outbound;
  inboundSecret = secrets.inbound;
});
afterEach(clean);

describe("pulling candidates", () => {
  it("asks with a signed GET, stores what comes back, and says how many are new", async () => {
    expect(await pullLibraryCandidates(KEY)).toEqual({ ok: true, created: 2, updated: 0, withdrawn: 0 });
    expect(seen).toEqual([{ method: "GET", path: "/api/ops/library/candidates", verified: true, body: "" }]);
    expect(await countPending(KEY)).toEqual({ FOOD_ITEM: 1, INGREDIENT: 1, PHOTO: 0 });
    expect((await prisma.notification.count({ where: { productKey: KEY, kind: "library.review" } }))).toBe(1);
    // a second pull changes nothing and does not announce again
    expect(await pullLibraryCandidates(KEY)).toEqual({ ok: true, created: 0, updated: 2, withdrawn: 0 });
    expect((await prisma.notification.count({ where: { productKey: KEY, kind: "library.review" } }))).toBe(1);
  });

  it("withdraws a pending item the product no longer lists", async () => {
    await pullLibraryCandidates(KEY);
    answer.body = JSON.stringify({ candidates: [cand("a")] });
    expect(await pullLibraryCandidates(KEY)).toMatchObject({ ok: true, withdrawn: 1 });
    expect((await listCandidates(KEY, { status: "WITHDRAWN" })).map((c) => c.remoteId)).toEqual(["b"]);
  });

  it("does not trust an unsigned or invalid answer, and treats 404 as 'no library review'", async () => {
    answer.sign = false;
    expect(await pullLibraryCandidates(KEY)).toMatchObject({ ok: false, error: expect.stringContaining("not signed correctly") });
    answer = { status: 200, body: JSON.stringify({ candidates: [{ id: "x", kind: "RECIPE", name: "n", kitchenCount: 1 }] }), sign: true };
    expect(await pullLibraryCandidates(KEY)).toMatchObject({ ok: false, error: expect.stringContaining("invalid") });
    answer = { status: 404, body: "Not found", sign: false };
    expect(await pullLibraryCandidates(KEY)).toEqual({ ok: true, created: 0, updated: 0, withdrawn: 0 });
    expect(await prisma.libraryCandidate.count({ where: { productKey: KEY } })).toBe(0);
  });

  it("the scheduled step checks a product at most every half hour", async () => {
    const t0 = new Date("2026-10-11T10:00:00Z");
    expect(await refreshLibraryCandidates(t0, KEY)).toBe(2);
    expect(await refreshLibraryCandidates(new Date(t0.getTime() + 5 * 60_000), KEY)).toBe(0);
    expect(seen).toHaveLength(1);
    answer.body = JSON.stringify({ candidates: [cand("a"), cand("b"), cand("c")] });
    expect(await refreshLibraryCandidates(new Date(t0.getTime() + 31 * 60_000), KEY)).toBe(1);
  });
});

describe("deciding", () => {
  async function pending(remoteId = "a") {
    await pullLibraryCandidates(KEY);
    return prisma.libraryCandidate.findFirstOrThrow({ where: { productKey: KEY, remoteId } });
  }

  it("sends the answer as a signed POST and records it when the product accepts", async () => {
    const c = await pending();
    seen = [];
    answer = { status: 200, body: JSON.stringify({ result: "applied" }), sign: true };
    const entry = { name: "Dish a (Edited)", categoryName: "Starters", foodType: "VEGETARIAN" as const, unit: null, description: "Nice" };
    await decideCandidate(c.id, { action: "approve", entry }, "staff-1");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "POST", path: "/api/ops/library/decisions", verified: true });
    expect(JSON.parse(seen[0].body)).toEqual({ candidateId: "a", action: "approve", entry });
    const after = await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: c.id } });
    expect([after.status, after.decidedById]).toEqual(["APPROVED", "staff-1"]);
    await expect(decideCandidate(c.id, { action: "reject" }, "staff-1")).rejects.toBeInstanceOf(LibraryReviewError); // already decided
  });

  it("keeps the item pending and shows the product's reason when it refuses", async () => {
    const c = await pending();
    answer = { status: 409, body: JSON.stringify({ error: '"Dish a" is already in the library. Merge it instead.' }), sign: true };
    await expect(decideCandidate(c.id, { action: "approve" }, "staff-1")).rejects.toThrow("already in the library");
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PENDING");
  });

  it("does not record a success the product did not sign", async () => {
    const c = await pending();
    answer = { status: 200, body: JSON.stringify({ result: "applied" }), sign: false };
    await expect(decideCandidate(c.id, { action: "reject" }, "staff-1")).rejects.toThrow("not signed correctly");
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PENDING");
  });

  it("sends a merge and a reject", async () => {
    const a = await pending("a");
    const b = await pending("b");
    answer = { status: 200, body: JSON.stringify({ result: "applied" }), sign: true };
    seen = [];
    await decideCandidate(a.id, { action: "merge", mergeIntoId: "lib-1" }, "s");
    await decideCandidate(b.id, { action: "reject" }, "s");
    expect(seen.map((s) => JSON.parse(s.body))).toEqual([{ candidateId: "a", action: "merge", mergeIntoId: "lib-1" }, { candidateId: "b", action: "reject" }]);
    expect((await listCandidates(KEY, { status: "MERGED" })).length).toBe(1);
    expect((await listCandidates(KEY, { status: "REJECTED" })).length).toBe(1);
  });

  it("a decided item is not reopened by a later pull", async () => {
    const c = await pending();
    answer = { status: 200, body: JSON.stringify({ result: "applied" }), sign: true };
    await decideCandidate(c.id, { action: "reject" }, "s");
    answer = { status: 200, body: JSON.stringify({ candidates: [cand("a")] }), sign: true };
    await pullLibraryCandidates(KEY);
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("REJECTED");
  });
});
