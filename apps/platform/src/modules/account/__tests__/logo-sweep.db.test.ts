import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { markLogoSaved, sweepAbandonedLogos } from "../logo-sweep";
import { openHarness, testUrl, type Harness } from "../../auth/__tests__/helpers";

// The abandoned-logo sweep against the identity test database and a temporary folder.
const key = (c: string) => `${c.repeat(32)}.png`;

describe.skipIf(!testUrl)("abandoned logo sweep", () => {
  let h: Harness;
  beforeAll(async () => { h = await openHarness(); }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    await h.pool.query('delete from "accountLogoUpload"; delete from "user"');
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U One', 'u1@x.test', true)`);
  });
  const upload = (k: string, daysOld: number) => h.pool.query(`insert into "accountLogoUpload" ("key", "userId", "createdAt") values ($1, 'u1', now() - make_interval(days => $2))`, [k, daysOld]);

  it("deletes an old never-saved upload (file and row), keeps a recent one, a saved one, and a file nobody recorded", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "logos-"));
    for (const c of ["a", "b", "c", "d"]) await writeFile(path.join(dir, key(c)), "x");
    await upload(key("a"), 10); // abandoned
    await upload(key("b"), 1); // too recent
    await upload(key("c"), 10); // old but saved to a profile
    await markLogoSaved(h.pool, `http://account.localhost:3300/api/business-logo/${key("c")}`);
    expect(await sweepAbandonedLogos(h.pool, { dir })).toBe(1);
    expect((await readdir(dir)).sort()).toEqual([key("b"), key("c"), key("d")]);
    const rows = (await h.pool.query(`select "key" from "accountLogoUpload" order by "key"`)).rows.map((r) => r.key);
    expect(rows).toEqual([key("b"), key("c")]);
    expect(await sweepAbandonedLogos(h.pool, { dir })).toBe(0); // again: nothing more
  });

  it("a link to anywhere else, or no link, marks nothing", async () => {
    await upload(key("e"), 10);
    await markLogoSaved(h.pool, "https://elsewhere.example/logo.png");
    await markLogoSaved(h.pool, null);
    expect((await h.pool.query(`select count(*) from "accountLogoUpload" where "savedAt" is not null`)).rows[0].count).toBe("0");
  });
});
