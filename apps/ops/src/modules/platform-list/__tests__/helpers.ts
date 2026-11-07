import { Pool } from "pg";
import { newId, requestTarget, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { handleProductListRequest } from "../platform-list";
import { provision, rotate } from "../../../../scripts/lib/platform-reader.mjs";

export const URL_ = "https://ops.example.com/api/platform/products";
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * These tests delete the platform_reader row and its audit rows. The local Ops database can hold a real platform-reader secret that
 * nobody has seen the plaintext of, and it must never be discarded by a test run. So they refuse to run unless the database in
 * DATABASE_URL is a scratch one (its name contains "test"). Make one with: createdb platterly_ops_x_test, then
 * pg_dump platterly_ops | psql platterly_ops_x_test, and run vitest with DATABASE_URL pointing at it.
 */
export function requireScratchDatabase() {
  const name = decodeURIComponent(new URL(process.env.DATABASE_URL ?? "postgres://none/none").pathname.slice(1));
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to run: DATABASE_URL points at "${name}", not a scratch database (name must contain "test"). These tests delete the platform_reader row; see apps/ops/src/modules/platform-list/__tests__/helpers.ts.`);
  }
}

/** What the CLI does, with the secret handed to the test instead of a file. */
export async function provisionKnown(): Promise<string> {
  let secret = "";
  await provision(pool, async (s: string) => {
    secret = s;
    return async () => undefined;
  });
  return secret;
}

export async function rotateKnown(): Promise<string> {
  let secret = "";
  await rotate(pool, async (s: string) => {
    secret = s;
    return async () => undefined;
  });
  return secret;
}

/** A throwaway platform client: signs a GET the way Platform Core will. */
export function call(secret: string | null, opts: { now?: number; method?: string; url?: string; tamperTarget?: string; headers?: Record<string, string>; drop?: string } = {}) {
  const url = opts.url ?? URL_;
  const signed = secret === null ? {} : signedHeaders(secret, newId("command"), "", { now: opts.now, target: requestTarget("GET", opts.tamperTarget ?? url) });
  const headers: Record<string, string> = { ...signed, ...opts.headers };
  if (opts.drop) delete headers[opts.drop];
  return handleProductListRequest(new Request(url, { method: opts.method ?? "GET", headers }));
}

/** Deletes the reader row and its audit rows. The guard is repeated here because vitest still runs `afterAll` when `beforeAll` throws. */
export async function reset() {
  requireScratchDatabase();
  await prisma.platformReader.deleteMany();
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: "platform_reader." } } });
}
