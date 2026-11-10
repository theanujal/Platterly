import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { labelTrustedDevice, listTrustedDevices, removeAllTrustedDevices, removeTrustedDevice } from "../trusted-devices";
import { openHarness, testUrl, type Harness } from "../../auth/__tests__/helpers";

describe.skipIf(!testUrl)("trusted devices (identity test database)", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await openHarness();
  }, 60_000);
  afterAll(async () => h?.pool.end());
  beforeEach(async () => {
    await h.pool.query('delete from verification; delete from "trustedDeviceLabel"; delete from session; delete from account; delete from "user"');
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U One', 'u1@x.test', true), ('u2', 'U Two', 'u2@x.test', true)`);
  });
  const trust = (id: string, user: string, days = 399) =>
    h.pool.query(`insert into verification (id, identifier, value, "expiresAt") values ($1, $2, $3, now() + ($4 || ' days')::interval)`, [`v-${id}`, `trust-device-${id}`, user, String(days)]);

  it("lists only the caller's own live trusted devices, with the label", async () => {
    await trust("a", "u1");
    await trust("b", "u2");
    await trust("old", "u1", -1);
    await h.pool.query(`insert into verification (id, identifier, value, "expiresAt") values ('v-x', 'email-otp-x', 'u1', now() + interval '1 day')`);
    await labelTrustedDevice(h.pool, "trust-device-a", "u1", "Chrome on a Mac");
    const list = await listTrustedDevices(h.pool, "u1");
    expect(list.map((d) => [d.id, d.label])).toEqual([["trust-device-a", "Chrome on a Mac"]]);
  });
  it("removes one of the caller's own devices, never another person's", async () => {
    await trust("a", "u1");
    await trust("b", "u2");
    expect(await removeTrustedDevice(h.pool, "u1", "trust-device-b")).toBe(false);
    expect((await listTrustedDevices(h.pool, "u2")).length).toBe(1);
    expect(await removeTrustedDevice(h.pool, "u1", "trust-device-a")).toBe(true);
    expect(await listTrustedDevices(h.pool, "u1")).toEqual([]);
  });
  it("remove-all clears one person's devices and labels and leaves other verification rows alone", async () => {
    await trust("a", "u1");
    await trust("b", "u1");
    await trust("c", "u2");
    await h.pool.query(`insert into verification (id, identifier, value, "expiresAt") values ('v-x', 'email-otp-x', 'u1', now() + interval '1 day')`);
    await labelTrustedDevice(h.pool, "trust-device-a", "u1", "Chrome");
    expect(await removeAllTrustedDevices(h.pool, "u1")).toBe(2);
    expect(await listTrustedDevices(h.pool, "u1")).toEqual([]);
    expect((await listTrustedDevices(h.pool, "u2")).length).toBe(1);
    expect((await h.pool.query(`select count(*) from verification where identifier = 'email-otp-x'`)).rows[0].count).toBe("1");
    expect((await h.pool.query(`select count(*) from "trustedDeviceLabel"`)).rows[0].count).toBe("0");
  });
});
