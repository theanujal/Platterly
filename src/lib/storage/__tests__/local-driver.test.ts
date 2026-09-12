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
});
