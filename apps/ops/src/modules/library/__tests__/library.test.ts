import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders, verifyRequest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { countPending, decideCandidate, fetchLibraryEntries, findEntryByName, listCandidates, pullLibraryCandidates, refreshLibraryCandidates, updateLibraryEntry, LibraryReviewError } from "../library";

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
    await decideCandidate(c.id, { action: "approve", entry }, null as unknown as string);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "POST", path: "/api/ops/library/decisions", verified: true });
    expect(JSON.parse(seen[0].body)).toEqual({ candidateId: "a", action: "approve", entry });
    const after = await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: c.id } });
    expect([after.status, after.decidedById]).toEqual(["APPROVED", null as unknown as string]);
    await expect(decideCandidate(c.id, { action: "reject" }, null as unknown as string)).rejects.toBeInstanceOf(LibraryReviewError); // already decided
  });

  it("keeps the item pending and shows the product's reason when it refuses", async () => {
    const c = await pending();
    answer = { status: 409, body: JSON.stringify({ error: '"Dish a" is already in the library. Merge it instead.' }), sign: true };
    await expect(decideCandidate(c.id, { action: "approve" }, null as unknown as string)).rejects.toThrow("already in the library");
    expect((await prisma.libraryCandidate.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PENDING");
  });

  it("does not record a success the product did not sign", async () => {
    const c = await pending();
    answer = { status: 200, body: JSON.stringify({ result: "applied" }), sign: false };
    await expect(decideCandidate(c.id, { action: "reject" }, null as unknown as string)).rejects.toThrow("not signed correctly");
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

describe("editing the library's own entries", () => {
  const entry = (id: string, over: Record<string, unknown> = {}) => ({ id, kind: "FOOD_ITEM", name: `Entry ${id}`, description: null, categoryName: "Starters", foodType: "VEGETARIAN", unit: null, aliases: [], isActive: true, ...over });

  it("reads the entries with a signed GET for the chosen kind", async () => {
    answer.body = JSON.stringify({ entries: [entry("e1"), entry("e2", { isActive: false })] });
    const entries = await fetchLibraryEntries(KEY, "FOOD_ITEM");
    expect(entries.map((e) => [e.id, e.isActive])).toEqual([["e1", true], ["e2", false]]);
    expect(seen).toEqual([{ method: "GET", path: "/api/ops/library/entries?kind=FOOD_ITEM", verified: true, body: "" }]);
  });

  it("refuses an unsigned or invalid list, and says when the product has no editor", async () => {
    answer.sign = false;
    await expect(fetchLibraryEntries(KEY, "FOOD_ITEM")).rejects.toThrow(/not signed correctly/);
    answer = { status: 200, body: JSON.stringify({ entries: [{ id: "x", kind: "RECIPE" }] }), sign: true };
    await expect(fetchLibraryEntries(KEY, "FOOD_ITEM")).rejects.toThrow(/invalid/);
    answer = { status: 404, body: "Not found", sign: false };
    await expect(fetchLibraryEntries(KEY, "FOOD_ITEM")).rejects.toThrow(/no library editor/);
  });

  it("sends one signed change and audits it only after the product accepted", async () => {
    answer.body = JSON.stringify({ result: "applied" });
    await updateLibraryEntry(KEY, { id: "e1", kind: "FOOD_ITEM", isActive: false }, null as unknown as string, "Entry e1");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "POST", path: "/api/ops/library/entries", verified: true });
    expect(JSON.parse(seen[0].body)).toEqual({ id: "e1", kind: "FOOD_ITEM", isActive: false });
    const logged = await prisma.auditLog.count({ where: { action: "library.entry.update", subject: KEY } });
    expect(logged).toBe(1);
    await prisma.auditLog.deleteMany({ where: { action: "library.entry.update", subject: KEY } });

    answer = { status: 409, body: JSON.stringify({ error: "\"X\" is already in the library." }), sign: true };
    await expect(updateLibraryEntry(KEY, { id: "e1", kind: "FOOD_ITEM", name: "X" }, null as unknown as string, "Entry e1")).rejects.toThrow(/already in the library/);
    expect(await prisma.auditLog.count({ where: { action: "library.entry.update", subject: KEY } })).toBe(0);
  });

  it("finds the library item a reviewer typed (by name or other name) for a candidate, in that candidate's own product and kind", async () => {
    await pullLibraryCandidates(KEY);
    const dishCandidate = (await listCandidates(KEY, { kind: "FOOD_ITEM" }))[0];
    answer.body = JSON.stringify({ entries: [entry("e1", { name: "Paneer Butter Masala", aliases: ["Paneer Makhani"] }), entry("e2", { name: "Dal Tadka" })] });
    seen = [];
    expect((await findEntryByName(dishCandidate.id, " paneer butter masala ")).id).toBe("e1");
    expect((await findEntryByName(dishCandidate.id, "PANEER MAKHANI")).id).toBe("e1");
    expect(seen[0].path).toBe("/api/ops/library/entries?kind=FOOD_ITEM");
    await expect(findEntryByName(dishCandidate.id, "Nothing like it")).rejects.toThrow(/not in the library/);
    await expect(findEntryByName(dishCandidate.id, "  ")).rejects.toThrow(/Type the name/);
    answer.body = JSON.stringify({ entries: [entry("e1", { name: "Same" }), entry("e2", { name: "same" })] });
    await expect(findEntryByName(dishCandidate.id, "same")).rejects.toThrow(/More than one/);
    await expect(findEntryByName("missing", "x")).rejects.toThrow(/not found/);
  });
});
