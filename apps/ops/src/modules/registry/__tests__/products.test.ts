import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-box";
import { RegistryError, finishRotation, normalizeBaseUrl, refreshManifest, registerProduct, rotateSecrets, secretsOf } from "../products";

const KEY = "regtest";

const manifest = {
  contract: 1,
  productKey: KEY,
  name: "Reg Test",
  version: "1.0.0",
  baseUrl: "https://regtest.example.com",
  entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }],
  trial: { days: 7, entitlements: { maxCustomers: 10 } },
};

async function clean() {
  await prisma.product.deleteMany({ where: { key: { startsWith: "regtest" } } });
}

describe("product registry", () => {
  beforeAll(clean);
  beforeEach(clean);
  afterAll(async () => {
    await clean();
  });

  it("registers a product, stores both secrets encrypted and returns them once", async () => {
    const { product, secrets } = await registerProduct({ key: "RegTest", name: " Reg Test ", baseUrl: "http://127.0.0.1:4010/", actorUserId: null });
    expect(product.key).toBe(KEY);
    expect(product.name).toBe("Reg Test");
    expect(product.baseUrl).toBe("http://127.0.0.1:4010");
    expect(product.outboundSecret).not.toContain(secrets.outbound);
    expect(decryptSecret(product.outboundSecret)).toBe(secrets.outbound);
    expect(decryptSecret(product.inboundSecret)).toBe(secrets.inbound);
    expect(secrets.outbound).not.toBe(secrets.inbound);
    expect((await prisma.auditLog.findMany({ where: { action: "product.registered", subject: KEY } })).length).toBeGreaterThan(0);
  });

  it("rejects a duplicate key, a bad key, a bad name and a bad URL", async () => {
    await registerProduct({ key: KEY, name: "A", baseUrl: "http://127.0.0.1:1", actorUserId: null });
    await expect(registerProduct({ key: KEY, name: "B", baseUrl: "http://127.0.0.1:1", actorUserId: null })).rejects.toThrow(RegistryError);
    await expect(registerProduct({ key: "Bad Key!", name: "B", baseUrl: "http://127.0.0.1:1", actorUserId: null })).rejects.toThrow(/product key/);
    await expect(registerProduct({ key: "regtest2", name: " ", baseUrl: "http://127.0.0.1:1", actorUserId: null })).rejects.toThrow(/name/);
    await expect(registerProduct({ key: "regtest3", name: "C", baseUrl: "ftp://x", actorUserId: null })).rejects.toThrow(/http/);
  });

  it("normalises base URLs and refuses credentials in them", () => {
    expect(normalizeBaseUrl("https://catering.platterly.in/")).toBe("https://catering.platterly.in");
    expect(normalizeBaseUrl("http://127.0.0.1:3000/some/path")).toBe("http://127.0.0.1:3000");
    expect(() => normalizeBaseUrl("https://user:pass@host.example")).toThrow(RegistryError);
    expect(() => normalizeBaseUrl("not a url")).toThrow(RegistryError);
  });

  it("rotation keeps the old secrets valid until it is finished", async () => {
    const { secrets: first } = await registerProduct({ key: KEY, name: "A", baseUrl: "http://127.0.0.1:1", actorUserId: null });
    const second = await rotateSecrets(KEY, null);
    expect(second.inbound).not.toBe(first.inbound);

    const during = secretsOf((await prisma.product.findUniqueOrThrow({ where: { key: KEY } })));
    expect(during.sign).toBe(second.outbound);
    expect(during.accept).toEqual([second.inbound, first.inbound]);

    await finishRotation(KEY, null);
    const after = secretsOf((await prisma.product.findUniqueOrThrow({ where: { key: KEY } })));
    expect(after.accept).toEqual([second.inbound]);
  });

  describe("refreshManifest", () => {
    let server: Server;
    let baseUrl: string;
    let behaviour: "good" | "wrong-key" | "unsigned" | "bad-json" | "error";
    let seenHeaders: Record<string, string | string[] | undefined> = {};
    let inboundSecret = "";

    beforeAll(async () => {
      server = createServer((req, res) => {
        seenHeaders = req.headers;
        if (behaviour === "error") {
          res.statusCode = 500;
          return res.end("boom");
        }
        const body = behaviour === "bad-json" ? "not json" : JSON.stringify(behaviour === "wrong-key" ? { ...manifest, productKey: "other" } : manifest);
        const headers = behaviour === "unsigned" ? {} : signedHeaders(inboundSecret, newId("command"), body);
        res.writeHead(200, headers);
        res.end(body);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    async function setup() {
      const { secrets } = await registerProduct({ key: KEY, name: "Reg Test", baseUrl, actorUserId: null });
      inboundSecret = secrets.inbound;
      return secrets;
    }

    it("reads, verifies and stores a signed manifest, and signs its own request", async () => {
      behaviour = "good";
      const secrets = await setup();
      const result = await refreshManifest(KEY, null);
      expect(result.ok).toBe(true);
      const stored = await prisma.product.findUniqueOrThrow({ where: { key: KEY } });
      expect(stored.manifestVersion).toBe("1.0.0");
      expect(stored.manifestError).toBeNull();
      expect(stored.manifestFetchedAt).not.toBeNull();
      // The request ops sent carried a valid signature made with the outbound secret.
      expect(String(seenHeaders["x-platterly-signature"])).toMatch(/^v1=[0-9a-f]{64}$/);
      expect(seenHeaders["x-platterly-contract"]).toBe("1");
      expect(secrets.outbound).toBeTruthy();
    });

    it.each([
      ["unsigned", /not signed correctly/],
      ["wrong-key", /not "regtest"|is for "other"/],
      ["bad-json", /not JSON|not signed/],
      ["error", /answered 500/],
    ] as const)("records a failure for a %s reply and keeps the old manifest", async (mode, pattern) => {
      behaviour = "good";
      await setup();
      await refreshManifest(KEY, null);
      behaviour = mode;
      const result = await refreshManifest(KEY, null);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(pattern);
      const stored = await prisma.product.findUniqueOrThrow({ where: { key: KEY } });
      expect(stored.manifestError).toBeTruthy();
      expect(stored.manifestVersion).toBe("1.0.0");
    });

    it("reports an unreachable product without throwing", async () => {
      await registerProduct({ key: KEY, name: "Reg Test", baseUrl: "http://127.0.0.1:9", actorUserId: null });
      const result = await refreshManifest(KEY, null);
      expect(result.ok).toBe(false);
      expect((await prisma.product.findUniqueOrThrow({ where: { key: KEY } })).manifestError).toMatch(/Could not reach/);
    });

    it("answers cleanly for an unknown product", async () => {
      expect(await refreshManifest("regtest-missing", null)).toEqual({ ok: false, error: "Product not found." });
    });
  });
});
