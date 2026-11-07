import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { importCaterlyUsers } from "../legacy-import.mjs";
import { Jar, call, openHarness, testUrl, type Harness } from "./helpers";

// F4.1.3 against the isolated identity test database. The "Caterly copy" is a synthetic schema (`legacy_src`) with Caterly-shaped user and account
// tables in the same test database; no real Caterly data is used. Passwords are hashed by Better Auth, as Caterly's are.
describe.skipIf(!testUrl)("F4.1.3 import of Caterly users", () => {
  let h: Harness;
  let source: Pool;
  const NOW = new Date("2026-10-01T10:00:00Z");

  beforeAll(async () => {
    h = await openHarness();
    await h.pool.query("drop schema if exists legacy_src cascade; create schema legacy_src;");
    source = new Pool({ connectionString: testUrl, max: 2, options: "-c search_path=legacy_src" });
    await source.query(`create table "user" (id text primary key, name text not null, email text not null, "emailVerified" boolean not null default false, image text,
      "createdAt" timestamptz not null, "updatedAt" timestamptz not null, "isSuperAdmin" boolean not null default false, "firstName" text, "lastName" text, phone text)`);
    await source.query(`create table account (id text primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user"(id),
      password text, "createdAt" timestamptz not null, "updatedAt" timestamptz not null)`);
  }, 60_000);
  afterAll(async () => {
    await source?.end();
    await h?.pool.query("drop schema if exists legacy_src cascade");
    await h?.pool.end();
  });
  beforeEach(async () => {
    await source.query('delete from account; delete from "user"');
    await h.pool.query('delete from session; delete from account; delete from "user"; delete from "rateLimit"');
  });

  async function seed(id: string, email: string, o: { verified?: boolean; password?: string | null; superAdmin?: boolean } = {}) {
    await source.query(`insert into "user" values ($1,$2,$3,$4,null,$5,$5,$6,'F','L','+919800000001')`, [id, `Name ${id}`, email, o.verified ?? true, NOW, o.superAdmin ?? false]);
    if (o.password !== null)
      await source.query(`insert into account values ($1,$2,'credential',$2,$3,$4,$4)`, [`acc_${id}`, id, await hashPassword(o.password ?? `pw-for-${id}-xx`), NOW]);
  }
  const signIn = (email: string, password: string) => call(h, new Jar(), "POST", "/api/auth/sign-in/email", { email, password });
  const counts = async () => ({
    users: Number((await h.pool.query('select count(*) from "user"')).rows[0].count),
    accounts: Number((await h.pool.query("select count(*) from account")).rows[0].count),
  });

  it("a dry run reports what it would do and writes nothing", async () => {
    await seed("c1", "a@kitchen.test");
    await seed("c2", "b@kitchen.test", { password: null });
    const report = await importCaterlyUsers({ source, target: h.pool });
    expect(report).toMatchObject({ sourceUsers: 2, sourceCredentialAccounts: 1, usersAdded: 2, credentialAccountsAdded: 1, addedWithoutPassword: 1, applied: false });
    expect(await counts()).toEqual({ users: 0, accounts: 0 });
  });

  it("an imported person signs in with their existing Caterly password, unchanged", async () => {
    await seed("c1", "a@kitchen.test", { password: "Kitchen pass 123" });
    const report = await importCaterlyUsers({ source, target: h.pool, apply: true });
    expect(report).toMatchObject({ usersAdded: 1, credentialAccountsAdded: 1, applied: true });
    const ok = await signIn("a@kitchen.test", "Kitchen pass 123");
    expect(ok.status).toBe(200);
    expect((await h.pool.query('select id from "user" where email = $1', ["a@kitchen.test"])).rows[0].id).toBe("c1");
    expect((await signIn("a@kitchen.test", "wrong password 9")).status).toBe(401);
  });

  it("keeps the verified flag: an unverified person cannot sign in yet, and a person with no password cannot either", async () => {
    await seed("c1", "u@kitchen.test", { verified: false, password: "Kitchen pass 123" });
    await seed("c2", "n@kitchen.test", { password: null });
    const report = await importCaterlyUsers({ source, target: h.pool, apply: true });
    expect(report).toMatchObject({ usersAdded: 2, addedUnverified: 1, addedWithoutPassword: 1 });
    expect((await signIn("u@kitchen.test", "Kitchen pass 123")).status).toBe(403);
    expect((await signIn("n@kitchen.test", "anything at all 1")).status).toBe(401);
  });

  it("lower-cases the email, copies no roles or flags, and the report holds no email, hash or name", async () => {
    await seed("c1", "Mixed.Case@Kitchen.TEST", { superAdmin: true, password: "Kitchen pass 123" });
    const report = await importCaterlyUsers({ source, target: h.pool, apply: true });
    expect((await h.pool.query('select email from "user"')).rows).toEqual([{ email: "mixed.case@kitchen.test" }]);
    expect((await signIn("mixed.case@kitchen.test", "Kitchen pass 123")).status).toBe(200);
    const hash = (await h.pool.query("select password from account")).rows[0].password as string;
    const text = JSON.stringify(report);
    for (const secret of ["kitchen.test", hash, hash.slice(0, 16), "Name c1"]) expect(text.toLowerCase()).not.toContain(secret.toLowerCase());
    expect((await h.pool.query(`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'user' and column_name = 'isSuperAdmin'`)).rows[0].count).toBe("0");
    // The common details are copied: first name, last name and phone.
    expect((await h.pool.query('select "firstName", "lastName", phone from "user"')).rows).toEqual([{ firstName: "F", lastName: "L", phone: "+919800000001" }]);
  });

  it("running it again changes nothing", async () => {
    await seed("c1", "a@kitchen.test");
    await seed("c2", "b@kitchen.test");
    await importCaterlyUsers({ source, target: h.pool, apply: true });
    const before = await counts();
    const again = await importCaterlyUsers({ source, target: h.pool, apply: true });
    expect(again).toMatchObject({ usersAdded: 0, usersAlreadyPresent: 2, credentialAccountsAdded: 0, emailConflicts: 0 });
    expect(await counts()).toEqual(before);
  });

  it("never replaces a password that has changed since, and never overwrites a different person who holds the same email", async () => {
    await seed("c1", "a@kitchen.test", { password: "Old caterly pass 1" });
    await importCaterlyUsers({ source, target: h.pool, apply: true });
    await h.pool.query(`update account set password = $1 where "userId" = 'c1'`, [await hashPassword("New platterly pass 2")]);
    await importCaterlyUsers({ source, target: h.pool, apply: true });
    expect((await signIn("a@kitchen.test", "New platterly pass 2")).status).toBe(200);
    expect((await signIn("a@kitchen.test", "Old caterly pass 1")).status).toBe(401);

    await seed("c9", "A@Kitchen.test", { password: "Other persons pass 3" });
    const report = await importCaterlyUsers({ source, target: h.pool, apply: true });
    expect(report).toMatchObject({ emailConflicts: 1, conflictUserIds: ["c9"] });
    expect((await h.pool.query(`select count(*) from "user" where id = 'c9'`)).rows[0].count).toBe("0");
    expect((await h.pool.query(`select count(*) from account where "userId" = 'c9'`)).rows[0].count).toBe("0");
  });

  it("a failure in the middle leaves the identity database as it was", async () => {
    await seed("c1", "a@kitchen.test");
    await seed("c2", "b@kitchen.test");
    const broken = { query: source.query.bind(source), connect: async () => { const c = await h.pool.connect(); let n = 0; const q = c.query.bind(c) as (...a: unknown[]) => unknown; (c as unknown as { query: unknown }).query = (...a: unknown[]) => (String(a[0]).includes('insert into "user"') && ++n === 2 ? Promise.reject(new Error("disk full")) : q(...a)); return c; } };
    await expect(importCaterlyUsers({ source, target: broken as unknown as Pool, apply: true })).rejects.toThrow("disk full");
    expect(await counts()).toEqual({ users: 0, accounts: 0 });
  });
});
