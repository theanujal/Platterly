import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { productBrand } from "../branding";
import { openHarness, testUrl, type Harness } from "./helpers";

// How a product is named and shown on the central sign-in pages, from its registered client, against the isolated identity test database.
describe.skipIf(!testUrl)("branded sign-in: productBrand", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await openHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.pool.end();
  });
  beforeEach(async () => {
    await h.pool.query('delete from "oauthClient" where "clientId" like $1', ["brand-%"]);
  });

  const client = (id: string, o: { name?: string | null; icon?: string | null; disabled?: boolean; redirect?: string } = {}) =>
    h.pool.query(
      `insert into "oauthClient" ("id", "clientId", "name", "icon", "disabled", "redirectUris", "createdAt", "updatedAt") values ($1, $1, $2, $3, $4, $5::jsonb, now(), now())`,
      [id, o.name === undefined ? "Brand Co" : o.name, o.icon === undefined ? null : o.icon, o.disabled ?? false, JSON.stringify([o.redirect ?? "http://brand.localhost:3500/auth/callback"])],
    );

  it("gives the product's name and a logo hosted on its own registered address", async () => {
    await client("brand-a", { icon: "http://brand.localhost:3500/logo.svg" });
    expect(await productBrand(h.pool, "brand-a")).toEqual({ name: "Brand Co", icon: "http://brand.localhost:3500/logo.svg", theme: null });
  });
  it("drops a logo that is not on one of the product's own addresses (no third-party image), a non-web address, or a broken one, but keeps the name", async () => {
    for (const icon of ["https://tracker.example/pixel.png", "javascript:alert(1)", "data:image/svg+xml;base64,AAAA", "not a url"]) {
      await h.pool.query('delete from "oauthClient" where "clientId" = $1', ["brand-b"]);
      await client("brand-b", { icon });
      expect(await productBrand(h.pool, "brand-b"), icon).toEqual({ name: "Brand Co", icon: null, theme: null });
    }
  });
  it("shows no logo when none is registered, and trims the name", async () => {
    await client("brand-c", { name: "  Spaced Co  " });
    expect(await productBrand(h.pool, "brand-c")).toEqual({ name: "Spaced Co", icon: null, theme: null });
  });
  it("uses a registered look only from the fixed list: caterly is accepted, anything else is ignored", async () => {
    const withMetadata = (id: string, metadata: unknown) =>
      h.pool.query(`insert into "oauthClient" ("id", "clientId", "name", "redirectUris", "metadata", "createdAt", "updatedAt") values ($1, $1, 'Look Co', '["http://look.localhost:3500/cb"]'::jsonb, $2::jsonb, now(), now())`, [id, JSON.stringify(metadata)]);
    await withMetadata("brand-t1", { theme: "caterly" });
    await withMetadata("brand-t2", { theme: "<script>alert(1)</script>" });
    await withMetadata("brand-t3", { theme: 5 });
    await withMetadata("brand-t4", "caterly");
    await withMetadata("brand-t5", {});
    expect((await productBrand(h.pool, "brand-t1"))?.theme).toBe("caterly");
    for (const id of ["brand-t2", "brand-t3", "brand-t4", "brand-t5"]) expect((await productBrand(h.pool, id))?.theme, id).toBeNull();
  });
  it("gives nothing for an unknown, disabled, unnamed, over-long-named or first-party client, or a malformed or missing client id", async () => {
    await client("brand-d", { disabled: true });
    await client("brand-e", { name: null });
    await client("brand-f", { name: "x".repeat(61) });
    await h.pool.query(`insert into "oauthClient" ("id", "clientId", "name", "redirectUris", "createdAt", "updatedAt") values ('platterly-account', 'platterly-account', 'Platterly Account', '["http://account.localhost:3300/auth/callback"]'::jsonb, now(), now()) on conflict do nothing`);
    for (const id of ["nope", "brand-d", "brand-e", "brand-f", "platterly-account", "", undefined, null, "bad id with spaces", "a".repeat(101), "x'; drop table \"user\";--"]) expect(await productBrand(h.pool, id as string), String(id)).toBeNull();
  });
});
