import { describe, it, expect, afterEach } from "vitest";
import { access } from "node:fs/promises";
import path from "node:path";
import { getStorageDriver } from "@/lib/storage/storage";

const cleanupKeys: string[] = [];

afterEach(async () => {
  const driver = getStorageDriver();
  await Promise.all(cleanupKeys.map((k) => driver.delete(k)));
  cleanupKeys.length = 0;
});

describe("local storage driver (Chunk 2 Group 2.3)", () => {
  it("round-trips a real file write, URL, and delete against the filesystem", async () => {
    const driver = getStorageDriver();
    const key = `test-org/${crypto.randomUUID()}.txt`;
    cleanupKeys.push(key);

    const { url } = await driver.upload(key, Buffer.from("hello"), "text/plain");
    expect(url).toBe(`/uploads/${key}`);
    expect(driver.getUrl(key)).toBe(url);

    const diskPath = path.join(process.cwd(), "public", "uploads", key);
    await expect(access(diskPath)).resolves.toBeUndefined();

    await driver.delete(key);
    await expect(access(diskPath)).rejects.toThrow();
  });

  it("rejects a path-traversal key", async () => {
    const driver = getStorageDriver();
    await expect(driver.upload("../../etc/passwd", Buffer.from("x"), "text/plain")).rejects.toThrow(
      /Unsafe storage key/,
    );
  });

  it("keeps files in UPLOAD_ROOT when it is set (the VPS's one shared, backed-up folder), and still refuses a path outside it", async () => {
    const { mkdtemp, rm, readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const root = await mkdtemp(path.join(tmpdir(), "platterly-uploads-"));
    const saved = process.env.UPLOAD_ROOT;
    process.env.UPLOAD_ROOT = root;
    try {
      const vi = await import("vitest").then((m) => m.vi);
      vi.resetModules();
      const { localDriver } = await import("@/lib/storage/local-driver");
      const key = `org-1/${crypto.randomUUID()}.txt`;
      expect((await localDriver.upload(key, Buffer.from("on the vps"), "text/plain")).url).toBe(`/uploads/${key}`);
      expect((await readFile(path.join(root, key))).toString()).toBe("on the vps");
      expect((await localDriver.read(key)).toString()).toBe("on the vps");
      await expect(localDriver.upload("../escape.txt", Buffer.from("x"), "text/plain")).rejects.toThrow(/Unsafe storage key/);
      await localDriver.delete(key);
      await expect(access(path.join(root, key))).rejects.toThrow();
    } finally {
      if (saved === undefined) delete process.env.UPLOAD_ROOT;
      else process.env.UPLOAD_ROOT = saved;
      const vi = await import("vitest").then((m) => m.vi);
      vi.resetModules();
      await rm(root, { recursive: true, force: true });
    }
  });
});
