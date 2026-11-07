import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PHOTO_MAX_BYTES, readPhoto, removePhoto, savePhoto, sniffImage } from "../photo";
import { openHarness, testUrl, type Harness } from "../../auth/__tests__/helpers";

const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]);
const WEBP = Uint8Array.from([...Buffer.from("RIFF"), 1, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]);

describe("sniffImage", () => {
  it("knows the three allowed kinds from their first bytes, and nothing else", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(WEBP)).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)></svg>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("GIF89a......"))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
  });
});

describe.skipIf(!testUrl)("profile photo (identity test database)", () => {
  let h: Harness;
  let dir: string;
  beforeAll(async () => {
    h = await openHarness();
    dir = await mkdtemp(path.join(os.tmpdir(), "photo-test-"));
  }, 60_000);
  afterAll(async () => {
    await h?.pool.end();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await h.pool.query('delete from "accountProfile"; delete from session; delete from account; delete from "user"');
    await h.pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U One', 'u1@x.test', true), ('u2', 'U Two', 'u2@x.test', true)`);
    for (const f of await readdir(dir)) await rm(path.join(dir, f));
  });

  it("saves a photo, reads it back as that person's own, and gives nobody else a picture", async () => {
    expect((await savePhoto(h.pool, "u1", PNG, dir)).ok).toBe(true);
    const mine = await readPhoto(h.pool, "u1", dir);
    expect(mine?.type).toBe("image/png");
    expect(Buffer.compare(mine!.bytes, Buffer.from(PNG))).toBe(0);
    expect(await readPhoto(h.pool, "u2", dir)).toBeNull();
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{32}\.png$/);
  });
  it("replacing a photo removes the old file; removing it removes the file and the record", async () => {
    await savePhoto(h.pool, "u1", PNG, dir);
    await savePhoto(h.pool, "u1", JPEG, dir);
    expect(await readdir(dir)).toHaveLength(1);
    expect((await readPhoto(h.pool, "u1", dir))?.type).toBe("image/jpeg");
    expect(await removePhoto(h.pool, "u1", dir)).toBe(true);
    expect(await readdir(dir)).toHaveLength(0);
    expect(await readPhoto(h.pool, "u1", dir)).toBeNull();
    expect(await removePhoto(h.pool, "u1", dir)).toBe(false);
  });
  it("refuses an empty file, a file over 2 MB and anything that is not a JPEG, PNG or WebP, and stores nothing", async () => {
    expect(await savePhoto(h.pool, "u1", new Uint8Array(0), dir)).toEqual({ ok: false, reason: "empty" });
    expect(await savePhoto(h.pool, "u1", new Uint8Array(PHOTO_MAX_BYTES + 1).fill(0xff), dir)).toEqual({ ok: false, reason: "too_large" });
    expect(await savePhoto(h.pool, "u1", new TextEncoder().encode("<svg></svg>"), dir)).toEqual({ ok: false, reason: "not_an_image" });
    expect(await readdir(dir)).toHaveLength(0);
  });
});
