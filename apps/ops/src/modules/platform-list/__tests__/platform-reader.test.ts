import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { prisma } from "@/lib/db";
import { encryptSecret, defaultSecretPath, fileDeliverer, finish, provision, ReaderError, rotate, status } from "../../../../scripts/lib/platform-reader.mjs";
import { call, pool, provisionKnown, requireScratchDatabase, reset, rotateKnown } from "./helpers";

const run = promisify(execFile);
const OPS_DIR = resolve(__dirname, "../../../..");
const CLI = join(OPS_DIR, "scripts/platform-reader.mjs");
const noop = async () => async () => undefined;

async function rowFingerprint() {
  const r = await prisma.platformReader.findUniqueOrThrow({ where: { id: "default" } });
  return JSON.stringify([r.secret, r.secretPrevious, r.rotatedAt, r.listVersion, r.listHash, r.createdAt, r.updatedAt]);
}
const auditRows = () => prisma.auditLog.findMany({ where: { action: { startsWith: "platform_reader." } }, orderBy: { createdAt: "asc" } });

/** Runs the CLI as a real process with a throwaway HOME. Resolves with the exit code and everything it printed. */
async function cli(home: string, ...args: string[]) {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd: OPS_DIR, env: { ...process.env, HOME: home } });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

let home: string;
let savedHome: string | undefined;

describe("platform-reader provisioning and rotation (F6.1.0)", () => {
  beforeAll(() => requireScratchDatabase());
  beforeEach(async () => {
    await reset();
    savedHome = process.env.HOME;
    home = mkdtempSync(join(tmpdir(), "plr-home-"));
    process.env.HOME = home;
  });
  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    rmSync(home, { recursive: true, force: true });
  });
  afterAll(async () => {
    try {
      await reset();
    } finally {
      await pool.end();
    }
  });

  describe("initial provisioning", () => {
    it("creates one encrypted secret, audits it, and hands the plaintext only to the deliverer", async () => {
      expect((await status(pool)).provisioned).toBe(false);
      const secret = await provisionKnown();
      expect(secret).toMatch(/^opssec_/);
      expect(await status(pool)).toMatchObject({ provisioned: true, rotationPending: false });
      const row = await prisma.platformReader.findUniqueOrThrow({ where: { id: "default" } });
      expect(row.secret.startsWith("v1.")).toBe(true);
      expect(JSON.stringify(row)).not.toContain(secret);
      expect((await call(secret)).status).toBe(200);
      const audit = await auditRows();
      expect(audit.map((a) => a.action)).toEqual(["platform_reader.provisioned"]);
      expect(audit[0].actorUserId).toBeNull();
    });

    it("is refused when a secret already exists, and the existing record is left exactly as it was", async () => {
      await provisionKnown();
      const before = await rowFingerprint();
      let delivered = 0;
      await expect(provision(pool, async () => { delivered++; return async () => undefined; })).rejects.toBeInstanceOf(ReaderError);
      expect(delivered).toBe(0);
      expect(await rowFingerprint()).toBe(before);
      expect(await auditRows()).toHaveLength(1);
    });

    it("is concurrency-safe: simultaneous provisions leave exactly one secret, one audit row and no stray delivery", async () => {
      let delivered = 0;
      let cleaned = 0;
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          provision(pool, async () => {
            delivered++;
            return async () => { cleaned++; };
          }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ReaderError);
      expect(await prisma.platformReader.count()).toBe(1);
      expect(await auditRows()).toHaveLength(1);
      expect(delivered - cleaned).toBe(1);
    });

    it("makes no change at all if the audit row cannot be written, and removes what it delivered", async () => {
      // Its own pool, so the patched connection can never be handed to another test.
      const own = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
      const failing = {
        query: own.query.bind(own),
        connect: async () => {
          const client = await own.connect();
          const original = client.query.bind(client) as (...a: unknown[]) => Promise<unknown>;
          (client as unknown as { query: unknown }).query = (text: unknown, ...rest: unknown[]) => (typeof text === "string" && text.includes("audit_log") ? Promise.reject(new Error("audit down")) : original(text, ...rest));
          return client;
        },
      };
      let cleaned = 0;
      try {
        await expect(provision(failing, async () => async () => { cleaned++; })).rejects.toThrow("audit down");
      } finally {
        await own.end();
      }
      expect(await prisma.platformReader.count()).toBe(0);
      expect(cleaned).toBe(1);
    });
  });

  describe("existing record (a secret whose plaintext nobody ever saw)", () => {
    async function plantExistingRecord() {
      const unknown = "opssec_planted_and_never_shown_to_anyone";
      await prisma.platformReader.create({ data: { id: "default", secret: encryptSecret(unknown) } });
      return unknown;
    }

    it("is never overwritten by provision; it stays valid; rotation then issues a new secret while the old one keeps working", async () => {
      const unknown = await plantExistingRecord();
      const before = await rowFingerprint();
      await expect(provision(pool, noop)).rejects.toThrow(/already exists/);
      expect(await rowFingerprint()).toBe(before);
      expect((await call(unknown)).status).toBe(200);

      const next = await rotateKnown();
      expect((await call(unknown)).status).toBe(200);
      expect((await call(next)).status).toBe(200);
      expect(await status(pool)).toMatchObject({ rotationPending: true });

      await finish(pool);
      expect((await call(unknown)).status).toBe(401);
      expect((await call(next)).status).toBe(200);
      expect((await auditRows()).map((a) => a.action)).toEqual(["platform_reader.rotated", "platform_reader.rotation_finished"]);
    });

    it("rotate on a database with no secret is refused and creates nothing", async () => {
      await expect(rotate(pool, noop)).rejects.toThrow(/provision/);
      expect(await prisma.platformReader.count()).toBe(0);
    });
  });

  describe("rotation", () => {
    it("keeps both secrets valid until finish, then only the new one", async () => {
      const first = await provisionKnown();
      const second = await rotateKnown();
      expect((await call(first)).status).toBe(200);
      expect((await call(second)).status).toBe(200);
      await finish(pool);
      expect((await call(first)).status).toBe(401);
      expect((await call(second)).status).toBe(200);
    });

    it("refuses a second rotation while the first is unfinished, and changes nothing", async () => {
      const first = await provisionKnown();
      const second = await rotateKnown();
      const before = await rowFingerprint();
      let delivered = 0;
      await expect(rotate(pool, async () => { delivered++; return async () => undefined; })).rejects.toThrow(/unfinished/);
      expect(delivered).toBe(0);
      expect(await rowFingerprint()).toBe(before);
      expect((await call(first)).status).toBe(200);
      expect((await call(second)).status).toBe(200);
    });

    it("is concurrency-safe: simultaneous rotations produce exactly one new secret and keep the original as the only previous one", async () => {
      const original = await provisionKnown();
      let delivered = 0;
      let cleaned = 0;
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          rotate(pool, async () => {
            delivered++;
            return async () => { cleaned++; };
          }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ReaderError);
      expect(delivered - cleaned).toBe(1);
      expect((await call(original)).status).toBe(200);
      expect((await auditRows()).filter((a) => a.action === "platform_reader.rotated")).toHaveLength(1);
    });

    it("finish is refused when no rotation is pending, and is audited when it happens", async () => {
      await provisionKnown();
      await expect(finish(pool)).rejects.toThrow(/nothing to finish/);
      await rotateKnown();
      await finish(pool);
      await expect(finish(pool)).rejects.toThrow(/nothing to finish/);
      expect((await auditRows()).map((a) => a.action)).toEqual(["platform_reader.provisioned", "platform_reader.rotated", "platform_reader.rotation_finished"]);
    });

    it("never puts a secret into an audit row", async () => {
      const a = await provisionKnown();
      const b = await rotateKnown();
      await finish(pool);
      const text = JSON.stringify(await auditRows());
      expect(text).not.toContain(a);
      expect(text).not.toContain(b);
      expect(text).not.toMatch(/opssec_/);
    });
  });

  describe("secret files", () => {
    it("creates ~/.platterly with mode 700 and the secret file with mode 600, holding exactly the secret", async () => {
      const path = defaultSecretPath("provision");
      expect(path).toBe(join(home, ".platterly", "platform-reader.secret"));
      let secret = "";
      await provision(pool, async (s: string) => { secret = s; return fileDeliverer(path)(s); });
      expect(statSync(join(home, ".platterly")).mode & 0o777).toBe(0o700);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(readFileSync(path, "utf8")).toBe(`${secret}\n`);
      expect((await call(secret)).status).toBe(200);
    });

    it("never overwrites an existing file, and then provisions nothing", async () => {
      const path = defaultSecretPath("provision");
      mkdirSync(join(home, ".platterly"), { mode: 0o700 });
      writeFileSync(path, "keep me\n", { mode: 0o600 });
      await expect(provision(pool, fileDeliverer(path))).rejects.toThrow(/never overwritten/);
      expect(readFileSync(path, "utf8")).toBe("keep me\n");
      expect(await prisma.platformReader.count()).toBe(0);
    });

    it("refuses a link at the destination and leaves its target alone", async () => {
      const dir = join(home, ".platterly");
      mkdirSync(dir, { mode: 0o700 });
      const target = join(home, "victim");
      writeFileSync(target, "victim\n");
      symlinkSync(target, join(dir, "platform-reader.secret"));
      await expect(provision(pool, fileDeliverer(join(dir, "platform-reader.secret")))).rejects.toThrow(ReaderError);
      expect(readFileSync(target, "utf8")).toBe("victim\n");
      expect(await prisma.platformReader.count()).toBe(0);
    });

    it("refuses a directory that other users can open, and a directory that does not exist (other than the default one)", async () => {
      const open = join(home, "open");
      mkdirSync(open);
      chmodSync(open, 0o755);
      await expect(provision(pool, fileDeliverer(join(open, "s")))).rejects.toThrow(/open to other users/);
      expect(existsSync(join(open, "s"))).toBe(false);
      await expect(provision(pool, fileDeliverer(join(home, "missing", "s")))).rejects.toThrow(/does not exist/);
      expect(await prisma.platformReader.count()).toBe(0);
    });

    it("removes its own file again when the database change fails", async () => {
      await provisionKnown();
      const path = join(home, ".platterly", "late.secret");
      await expect(provision(pool, fileDeliverer(path))).rejects.toThrow(/already exists/); // refused before any file is made
      expect(existsSync(path)).toBe(false);
      const failing = { query: pool.query.bind(pool), connect: async () => { throw new Error("db down"); } };
      await reset();
      await expect(provision(failing, fileDeliverer(path))).rejects.toThrow("db down");
      expect(existsSync(path)).toBe(false);
    });

    it("a rotation never reuses the first file's name", () => {
      const a = defaultSecretPath("provision");
      const b = defaultSecretPath("rotate", new Date("2026-11-04T10:20:30.456Z"));
      expect(b).toBe(`${a}.next-20261104T102030Z`);
    });
  });

  describe("the command-line tool, as a real process", () => {
    it("provisions, rotates and finishes without ever printing a secret, and the files verify against the endpoint", async () => {
      expect((await cli(home, "status")).out).toMatch(/Not provisioned/);

      const p = await cli(home, "provision");
      expect(p.code, p.out).toBe(0);
      const file = join(home, ".platterly", "platform-reader.secret");
      const first = readFileSync(file, "utf8").trim();
      expect(first).toMatch(/^opssec_/);
      expect(p.out).not.toContain(first);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(statSync(join(home, ".platterly")).mode & 0o777).toBe(0o700);
      expect((await call(first)).status).toBe(200);

      const again = await cli(home, "provision");
      expect(again.code).toBe(1);
      expect(again.out).toMatch(/already exists/);
      expect(readFileSync(file, "utf8").trim()).toBe(first);

      const r = await cli(home, "rotate");
      expect(r.code, r.out).toBe(0);
      const rotated = readdirSync(join(home, ".platterly")).filter((n) => n.includes(".next-"));
      expect(rotated).toHaveLength(1);
      const second = readFileSync(join(home, ".platterly", rotated[0]), "utf8").trim();
      expect(second).not.toBe(first);
      expect(r.out).not.toContain(first);
      expect(r.out).not.toContain(second);
      expect((await call(first)).status).toBe(200);
      expect((await call(second)).status).toBe(200);

      const overlap = await cli(home, "rotate");
      expect(overlap.code).toBe(1);
      expect(overlap.out).toMatch(/unfinished/);
      expect(readdirSync(join(home, ".platterly")).filter((n) => n.includes(".next-"))).toHaveLength(1);

      const noFlag = await cli(home, "finish");
      expect(noFlag.code).toBe(1);
      expect(noFlag.out).toMatch(/confirm-consumer-verified/);
      expect((await call(first)).status).toBe(200);

      const done = await cli(home, "finish", "--confirm-consumer-verified");
      expect(done.code, done.out).toBe(0);
      expect((await call(first)).status).toBe(401);
      expect((await call(second)).status).toBe(200);
      expect((await cli(home, "finish", "--confirm-consumer-verified")).code).toBe(1);

      const audit = await auditRows();
      expect(audit.map((a) => a.action)).toEqual(["platform_reader.provisioned", "platform_reader.rotated", "platform_reader.rotation_finished"]);
      for (const a of audit) expect(a.actorUserId).toBeNull();
      expect(JSON.stringify(audit)).not.toMatch(/opssec_/);
      expect(audit[0].detail).toMatchObject({ via: "cli", output: file });
    });

    it("two providers racing for the same file or for the same database leave one secret and one file", async () => {
      const results = await Promise.all(Array.from({ length: 4 }, () => cli(home, "provision")));
      expect(results.filter((x) => x.code === 0)).toHaveLength(1);
      expect(readdirSync(join(home, ".platterly"))).toEqual(["platform-reader.secret"]);
      await reset();
      rmSync(join(home, ".platterly"), { recursive: true });
      mkdirSync(join(home, ".platterly"), { mode: 0o700 });
      const distinct = await Promise.all(Array.from({ length: 4 }, (_, i) => cli(home, "provision", "--out", join(home, ".platterly", `s${i}`))));
      expect(distinct.filter((x) => x.code === 0)).toHaveLength(1);
      expect(readdirSync(join(home, ".platterly"))).toHaveLength(1);
      expect(await prisma.platformReader.count()).toBe(1);
    });

    it("rejects an unknown command or option and a missing --out value", async () => {
      expect((await cli(home, "show")).code).toBe(1);
      expect((await cli(home, "provision", "--print")).code).toBe(1);
      const noPath = await cli(home, "provision", "--out");
      expect(noPath.code).toBe(1);
      expect(await prisma.platformReader.count()).toBe(0);
    });

    it("the code contains no way to print a secret or take one on the command line", () => {
      const lib = readFileSync(join(OPS_DIR, "scripts/lib/platform-reader.mjs"), "utf8");
      const tool = readFileSync(CLI, "utf8");
      // The library never prints. The tool never even holds a plaintext secret (it only passes a file deliverer), so it cannot print one.
      expect(lib).not.toMatch(/console\./);
      expect(tool).not.toMatch(/\b(newSigningSecret|encryptSecret|decryptSecret)\b/);
      // Arguments are only the command and its option names/paths.
      expect(tool).not.toMatch(/--(secret|value|password)/i);
    });
  });
});
