import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { loadCredentials, openGuarded, redact, type Credentials } from "../../../lib/migration-roundtrip/__tests__/db-target";
import { findOrCreateBySubject, type IdentityLinkClient, type IdentityLinkResult } from "../identity-link";
import { mintProviderEmailAssertion } from "../provider-assertion";

// F3.1.2 Chunk B: the identity-link service against the real isolated Stage 2 PostgreSQL (127.0.0.1:55433, platterly_platform_test).
// Nothing runs unless the guarded credentials are present. The guard is opened once (and fully released) before the Prisma pool connects,
// because the guard refuses to run while any other session is connected. No run-log rows are written. Every row this file creates carries a
// unique prefix for readability, but cleanup never matches on it: every created user id and identity id is recorded as it is created, cleanup
// deletes exactly those ids (in afterAll, so also after a failed test), then proves the three identity tables are empty again.
// (Matching on the email prefix missed the U+0130 case, where lower-casing changes the first character.)
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);

const PREFIX = `chunkb-${randomBytes(6).toString("hex")}-`;
const PROVIDER = `${PREFIX}provider`;
const email = (label: string) => `${PREFIX}${label}@chunkb.invalid`;
const subject = (label: string) => `${PREFIX}${label}`;

const CONCURRENCY = 20;

type DriverShape = { code: unknown; meta: unknown; message: string };
function shapeOf(error: unknown, creds: Credentials): DriverShape {
  const e = error as { code?: unknown; meta?: unknown; message?: unknown };
  return { code: e.code, meta: JSON.parse(redact(JSON.stringify(e.meta ?? null), creds)), message: redact(String(e.message ?? ""), creds) };
}
const cause = (shape: DriverShape) => (shape.meta as { driverAdapterError?: { cause?: Record<string, unknown> } } | null)?.driverAdapterError?.cause;

describe.skipIf(credentials === null)("identity-link service against the real isolated PostgreSQL", () => {
  const creds = credentials as Credentials;
  let pool: Pool;
  let prisma: PrismaClient;
  let client: IdentityLinkClient;
  const createdUsers = new Set<string>();
  const createdIdentities = new Set<string>();
  type Created = { id: string; identities?: { id: string }[] };
  const record = <T extends Created>(row: T): T => {
    createdUsers.add(row.id);
    for (const i of row.identities ?? []) createdIdentities.add(i.id);
    return row;
  };
  const withIdentities = { identities: { select: { id: true } } } as const;

  const counts = async () => ({
    users: await prisma.user.count(),
    identities: await prisma.userIdentity.count(),
    legacy: await prisma.legacyMapping.count(),
  });
  const mine = async () => ({
    users: await prisma.user.count({ where: { email: { startsWith: PREFIX } } }),
    identities: await prisma.userIdentity.count({ where: { provider: { startsWith: PREFIX } } }),
  });
  const cleanUp = async () => {
    // Exactly the ids recorded at creation. Identities first (RESTRICT foreign key), then users. No prefix, wildcard or table-wide delete.
    await prisma.userIdentity.deleteMany({ where: { id: { in: [...createdIdentities] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...createdUsers] } } });
  };

  beforeAll(async () => {
    const target = await openGuarded(creds, { applicationName: "platform-identity-link-chunk-b-guard" });
    await target.close();
    pool = new Pool({ connectionString: creds.url(), max: CONCURRENCY + 5, application_name: "platform-identity-link-chunk-b" });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    // Every user the service creates (and its identity) is recorded by id through this thin wrapper.
    client = {
      userIdentity: (prisma as unknown as IdentityLinkClient).userIdentity,
      user: {
        findUnique: (args) => (prisma as unknown as IdentityLinkClient).user.findUnique(args),
        create: async (args) => record(await prisma.user.create({ ...args, include: withIdentities } as never) as never),
      },
    };
    const before = await counts();
    expect(before, "the identity tables must be empty before the test starts").toEqual({ users: 0, identities: 0, legacy: 0 });
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      try {
        await cleanUp();
        const left = {
          users: await prisma.user.count({ where: { id: { in: [...createdUsers] } } }),
          identities: await prisma.userIdentity.count({ where: { id: { in: [...createdIdentities] } } }),
        };
        const all = await counts();
        // eslint-disable-next-line no-console
        console.log(`CLEANUP tracked-users=${createdUsers.size} tracked-identities=${createdIdentities.size} remaining-tracked=${JSON.stringify(left)} table-counts=${JSON.stringify(all)}`);
        expect(left).toEqual({ users: 0, identities: 0 });
        expect(all).toEqual({ users: 0, identities: 0, legacy: 0 });
      } finally {
        await prisma.$disconnect();
        await pool.end().catch(() => undefined);
      }
    }
  }, 60_000);

  it("A: 20 concurrent calls, same provider and subject, give one user, one identity and one user id", async () => {
    const input = { provider: PROVIDER, subject: subject("same"), email: email("same") };
    const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => findOrCreateBySubject(input, client)));
    const oks = results.filter((r): r is Extract<IdentityLinkResult, { ok: true }> => r.ok);
    expect(oks).toHaveLength(CONCURRENCY);
    expect(new Set(oks.map((r) => r.user.id)).size).toBe(1);
    expect(oks.filter((r) => r.created).length).toBe(1);
    expect(await mine()).toEqual({ users: 1, identities: 1 });
    const identity = await prisma.userIdentity.findMany({ where: { provider: PROVIDER, subject: input.subject } });
    expect(identity).toHaveLength(1);
    expect(identity[0].userId).toBe(oks[0].user.id);
    // eslint-disable-next-line no-console
    console.log(`SCENARIO-A calls=${CONCURRENCY} ok=${oks.length} created=${oks.filter((r) => r.created).length} distinctUserIds=1 users=1 identities=1`);
  }, 60_000);

  it("B: 20 concurrent calls, different subjects, same email, give one user and no wrong or duplicate identities", async () => {
    const shared = email("shared");
    const subjects = Array.from({ length: CONCURRENCY }, (_, i) => subject(`diff-${i}`));
    const results = await Promise.all(subjects.map((s) => findOrCreateBySubject({ provider: PROVIDER, subject: s, email: shared }, client)));
    const winners = results.filter((r): r is Extract<IdentityLinkResult, { ok: true }> => r.ok);
    const losers = results.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(winners[0].created).toBe(true);
    expect(losers).toHaveLength(CONCURRENCY - 1);
    for (const l of losers) expect(l).toEqual({ ok: false, reason: "email_belongs_to_another_user" });
    expect(await prisma.user.count({ where: { email: shared } })).toBe(1);
    // Only the winning subject has an identity, and it belongs to the one user.
    const rows = await prisma.userIdentity.findMany({ where: { subject: { in: subjects } } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(winners[0].user.id);
    const winnerIndex = results.findIndex((r) => r.ok);
    expect(rows[0].subject).toBe(subjects[winnerIndex]);
    // eslint-disable-next-line no-console
    console.log(`SCENARIO-B calls=${CONCURRENCY} ok=${winners.length} email_belongs_to_another_user=${losers.length} users-with-email=1 identities-for-these-subjects=${rows.length}`);
  }, 60_000);

  it("C: the real Prisma error metadata for the provider/subject race and the email race", async () => {
    const creator = (e: string, s: string) => prisma.user.create({ data: { email: e, identities: { create: { provider: PROVIDER, subject: s } } }, include: withIdentities }).then(record);

    // Identity race: same (provider, subject), different emails, so only user_identities_provider_subject_key can fire.
    const idSettled = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => creator(email(`c-id-${i}`), subject("c-id"))));
    const idFailures = idSettled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(idSettled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(idFailures.length).toBe(7);
    const idShape = shapeOf(idFailures[0].reason, creds);
    expect(idShape.code).toBe("P2002");
    expect(cause(idShape)?.kind).toBe("UniqueConstraintViolation");
    expect((cause(idShape)?.constraint as { index?: string } | undefined)?.index).toBe("user_identities_provider_subject_key");
    for (const f of idFailures) expect((cause(shapeOf(f.reason, creds))?.constraint as { index?: string } | undefined)?.index).toBe("user_identities_provider_subject_key");
    // The failed attempts left no half-written user: only the winner's user (with this label) exists.
    expect(await prisma.user.count({ where: { email: { startsWith: `${PREFIX}c-id-` } } })).toBe(1);

    // Email race: same email, different subjects, so only users_email_key can fire.
    const emSettled = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => creator(email("c-em"), subject(`c-em-${i}`))));
    const emFailures = emSettled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(emSettled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(emFailures.length).toBe(7);
    const emShape = shapeOf(emFailures[0].reason, creds);
    expect(emShape.code).toBe("P2002");
    expect(cause(emShape)?.kind).toBe("UniqueConstraintViolation");
    expect((cause(emShape)?.constraint as { index?: string } | undefined)?.index).toBe("users_email_key");
    for (const f of emFailures) expect((cause(shapeOf(f.reason, creds))?.constraint as { index?: string } | undefined)?.index).toBe("users_email_key");
    expect(await prisma.userIdentity.count({ where: { subject: { startsWith: subject("c-em-") } } })).toBe(1);

    // eslint-disable-next-line no-console
    console.log(`SCENARIO-C identity-race ${JSON.stringify(idShape)}\nSCENARIO-C email-race ${JSON.stringify(emShape)}`);
  }, 60_000);

  it("D: the real P2039 / 23514 shape for a lower-case CHECK violation, and unrelated errors are not turned into invalid input", async () => {
    // U+0130 (capital I with dot). JavaScript lower-cases it to "i" + U+0307, PostgreSQL to "i", so the unmodified value fails users_email_lowercase.
    const dotted = `İ${PREFIX}d@chunkb.invalid`;
    let direct: DriverShape | undefined;
    try {
      record(await prisma.user.create({ data: { email: dotted, identities: { create: { provider: PROVIDER, subject: subject("d-direct") } } }, include: withIdentities }));
    } catch (error) {
      direct = shapeOf(error, creds);
    }
    expect(direct, "the database should have refused the un-normalised U+0130 email").toBeDefined();
    expect(direct?.code).toBe("P2039");
    expect(cause(direct as DriverShape)?.originalCode).toBe("23514");
    expect(String(cause(direct as DriverShape)?.originalMessage)).toContain('"users_email_lowercase"');
    // The failed insert left neither a user nor an identity behind.
    expect(await prisma.userIdentity.count({ where: { subject: subject("d-direct") } })).toBe(0);
    // eslint-disable-next-line no-console
    console.log(`SCENARIO-D direct-U+0130 ${JSON.stringify(direct)}`);

    // The same input through the service: whatever the outcome, record it exactly. normaliseEmail lower-cases in JavaScript first.
    const viaService = await findOrCreateBySubject({ provider: PROVIDER, subject: subject("d-service"), email: dotted }, client);
    // eslint-disable-next-line no-console
    console.log(`SCENARIO-D service-U+0130 result=${JSON.stringify(viaService.ok ? { ok: true, created: viaService.created, email: viaService.user.email } : viaService)}`);
    if (viaService.ok) {
      expect(viaService.created).toBe(true);
      expect(viaService.user.email).toBe(dotted.toLowerCase());
    } else {
      expect(viaService).toEqual({ ok: false, reason: "invalid_input", field: "email" });
    }

    // Unrelated database errors must propagate unchanged. 1) a different CHECK (users_status_check) reached through the service's create.
    const wrapped = (mutate: (data: Record<string, unknown>) => Record<string, unknown>): IdentityLinkClient => ({
      userIdentity: client.userIdentity,
      user: {
        findUnique: (args) => client.user.findUnique(args),
        create: (args) => client.user.create({ ...args, data: mutate(args.data as unknown as Record<string, unknown>) } as unknown as Parameters<IdentityLinkClient["user"]["create"]>[0]),
      },
    });
    const statusError = await findOrCreateBySubject({ provider: PROVIDER, subject: subject("d-status"), email: email("d-status") }, wrapped((d) => ({ ...d, status: "bogus" }))).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(statusError, "an unrelated CHECK violation must propagate, not become invalid_input").toBeDefined();
    const statusShape = shapeOf(statusError, creds);
    expect(statusShape.code).toBe("P2039");
    expect(cause(statusShape)?.originalCode).toBe("23514");
    expect(String(cause(statusShape)?.originalMessage)).not.toMatch(/users_email_(not_empty|trimmed|lowercase)/);
    // 2) a unique violation on an unrelated index (users_pkey): a pre-set id of an existing user.
    const existing = await prisma.user.findFirstOrThrow({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
    const pkError = await findOrCreateBySubject({ provider: PROVIDER, subject: subject("d-pk"), email: email("d-pk") }, wrapped((d) => ({ ...d, id: existing.id }))).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(pkError, "an unrelated unique violation must propagate, not be retried or hidden").toBeDefined();
    const pkShape = shapeOf(pkError, creds);
    expect(pkShape.code).toBe("P2002");
    expect((cause(pkShape)?.constraint as { index?: string } | undefined)?.index).toBe("users_pkey");
    // Neither failure wrote anything.
    expect(await prisma.userIdentity.count({ where: { subject: { in: [subject("d-status"), subject("d-pk")] } } })).toBe(0);
    // eslint-disable-next-line no-console
    console.log(`SCENARIO-D unrelated-check ${JSON.stringify(statusShape)}\nSCENARIO-D unrelated-unique ${JSON.stringify(pkShape)}`);
  }, 60_000);

  it("E: a verified-email assertion still works under concurrency (one create, one verified user)", async () => {
    const input = { provider: PROVIDER, subject: subject("e"), email: email("e") };
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => findOrCreateBySubject({ ...input, emailAssertion: mintProviderEmailAssertion(input) }, client)),
    );
    const oks = results.filter((r): r is Extract<IdentityLinkResult, { ok: true }> => r.ok);
    expect(oks).toHaveLength(CONCURRENCY);
    expect(oks.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(oks.map((r) => r.user.id)).size).toBe(1);
    expect(oks[0].user.emailVerifiedAt).not.toBeNull();
  }, 60_000);
});
