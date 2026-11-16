import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOGO_MAX_BYTES, logoKeyFromUrl, readLogo, removeReplacedLogo, saveLogo } from "../business-logo";

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

describe("deleting logo files nobody shows any more", () => {
  const save = async () => ((await saveLogo(PNG, dir)) as { key: string }).key;
  const url = (key: string) => `http://account.localhost:3300/api/business-logo/${key}`;
  it("reads a key only from a link to this Platform's own logos", () => {
    expect(logoKeyFromUrl(url("a".repeat(32) + ".png"))).toBe("a".repeat(32) + ".png");
    for (const other of [null, "", "https://caterly.example/uploads/x.png", url("../x.png"), url("a.png")]) expect(logoKeyFromUrl(other)).toBeNull();
  });
  it("deletes a replaced or removed logo, and keeps one that is still shown or still linked by another product", async () => {
    const replaced = await save();
    await removeReplacedLogo(url(replaced), url("b".repeat(32) + ".png"), [], dir);
    expect(await readLogo(replaced, dir)).toBeNull();
    const removed = await save();
    await removeReplacedLogo(url(removed), null, [], dir);
    expect(await readLogo(removed, dir)).toBeNull();
    const same = await save();
    await removeReplacedLogo(url(same), url(same), [], dir);
    expect(await readLogo(same, dir)).not.toBeNull();
    const shared = await save();
    await removeReplacedLogo(url(shared), null, [url(shared)], dir);
    expect(await readLogo(shared, dir)).not.toBeNull();
    await removeReplacedLogo("https://caterly.example/uploads/x.png", null, [], dir);
  });
});
