import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOGO_MAX_BYTES, readLogo, saveLogo } from "../business-logo";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
let dir = "";
beforeAll(async () => { dir = await mkdtemp(path.join(os.tmpdir(), "logo-test-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe("business logo files", () => {
  it("keeps a real image under a random name and serves it back with its real type", async () => {
    const saved = await saveLogo(PNG, dir);
    expect(saved.ok && saved.key).toMatch(/^[0-9a-f]{32}\.png$/);
    const read = await readLogo((saved as { key: string }).key, dir);
    expect(read?.type).toBe("image/png");
    expect(new Uint8Array(read!.bytes)).toEqual(PNG);
  });
  it("refuses an empty file, something that is not an image, and one over 4 MB", async () => {
    expect(await saveLogo(new Uint8Array(0), dir)).toEqual({ ok: false, reason: "empty" });
    expect(await saveLogo(new TextEncoder().encode("<svg onload=alert(1)>"), dir)).toEqual({ ok: false, reason: "not_an_image" });
    expect(await saveLogo(new Uint8Array(LOGO_MAX_BYTES + 1), dir)).toEqual({ ok: false, reason: "too_large" });
  });
  it("only serves names it made: no path tricks, no other files", async () => {
    for (const bad of ["../../etc/passwd", "a.png", `${"a".repeat(32)}.svg`, `${"a".repeat(32)}.png/../x`]) expect(await readLogo(bad, dir)).toBeNull();
  });
});
