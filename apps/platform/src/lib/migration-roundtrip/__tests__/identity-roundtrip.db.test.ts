import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkDownSql } from "../down-sql";
import { checkHistory, checkHistoryAfterDown, migrationChecksum } from "../history";
import { diffSnapshots } from "../inventory";
import {
  BASELINE_MIGRATION,
  Credentials,
  GuardRefusal,
  GuardedTarget,
  IDENTITY_MIGRATION,
  IDENTITY_TABLES,
  RunSequence,
  defaultConnect,
  identityDownSql,
  identityUpSql,
  loadCredentials,
  migrationFolders,
  openGuarded,
  runPrisma,
  schemaPath,
  writeSnapshotFile,
} from "./db-target";

// Run 1 of 4 (round trip): reset, deploy, check history and checksums, rehearse the reset, show the guard refusing wrong values,
// compare with Prisma, test that the down step is atomic, go down, come back up, and compare the two catalogues.
// The database ends migrated. Nothing here resets the database at the end, and no hook resets anything.
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);

describe.skipIf(credentials === null)("R1 migration round trip (isolated test database)", () => {
  const creds = credentials as Credentials;
  let target: GuardedTarget;
  let run: RunSequence;
  let snapshotA: string[] = [];
  let firstChecksum = "";

  beforeAll(async () => {
    target = await openGuarded(creds, { applicationName: "platform-stage2-guard:roundtrip" });
    run = await target.beginRun("roundtrip");
    console.log(`R1 run id: ${run.runId}`);
  });

  afterAll(async () => {
    try {
      await run?.abandonIfOpen();
    } finally {
      await target?.close();
    }
  });

  const deploy = (label: string) => {
    const result = runPrisma(creds, ["migrate", "deploy"]);
    expect(result.leaked, `${label}: a secret appeared in Prisma output`).toBe(false);
    expect(result.status, `${label}: ${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("successfully applied");
    return result;
  };

  it("reset: public is replaced inside one checked transaction and ends empty", () =>
    run.step("reset", async () => {
      const evidence = await target.reset();
      expect(evidence.staticEqual && evidence.contentEqual && evidence.noticesOnlyPublic).toBe(true);
      expect(evidence.ownerAfter).toBe(creds.role);
      expect(await target.publicRelations()).toEqual([]);
      console.log(`reset: guard unchanged; public owner ${evidence.ownerBefore} -> ${evidence.ownerAfter}`);
    }));

  it("deploy-1: prisma validate, then migrate deploy applies both migrations", () =>
    run.step("deploy-1", async () => {
      const validate = runPrisma(creds, ["validate"]);
      expect(validate.leaked).toBe(false);
      expect(validate.status, `${validate.stdout}\n${validate.stderr}`).toBe(0);
      expect(validate.stdout).toContain("valid");
      const result = deploy("deploy-1");
      expect(result.stdout).toContain(IDENTITY_MIGRATION);
      expect(result.stdout).toContain("2 migrations found");
      expect(await target.publicRelations()).toEqual(["_prisma_migrations", ...IDENTITY_TABLES, ].sort());
    }));

  it("history-checksum: the history rows match the folders and each checksum is the SHA-256 of its file", () =>
    run.step("history-checksum", async () => {
      const rows = await target.migrationRows();
      const folders = migrationFolders();
      for (const folder of folders) {
        const row = rows.find((r) => r.migration_name === folder.name);
        console.log(`checksum ${folder.name}: database ${row?.checksum.slice(0, 16)}... file ${migrationChecksum(folder.sql).slice(0, 16)}... match=${row?.checksum === migrationChecksum(folder.sql)}`);
      }
      const verdict = checkHistory(rows, folders);
      expect(verdict.ok ? [] : verdict.problems).toEqual([]);
      firstChecksum = rows.find((r) => r.migration_name === IDENTITY_MIGRATION)?.checksum ?? "";
      expect(firstChecksum).toHaveLength(64);
    }));

  it("reset-rehearsal: the whole reset, with its before and after checks, is rolled back and leaves everything as it was", () =>
    run.step("reset-rehearsal", async () => {
      const before = await target.publicRelations();
      const guardBefore = [...(await target.staticFingerprint()), ...(await target.contentFingerprint())];
      const evidence = await target.rehearseReset();
      expect(evidence.staticEqual && evidence.contentEqual && evidence.noticesOnlyPublic).toBe(true);
      expect(await target.publicRelations()).toEqual(before);
      expect(before).toContain("users");
      expect([...(await target.staticFingerprint()), ...(await target.contentFingerprint())]).toEqual(guardBefore);
      console.log(`rehearsal: ${evidence.notices.length} notice(s), none mention runner_guard; public still has ${before.length} relations`);
    }));

  it("refusal-demos: wrong port, database, role, sentinel token and cluster identifier all stop before any destructive statement", () =>
    run.step("refusal-demos", async () => {
      const guardBefore = [...(await target.staticFingerprint()), ...(await target.contentFingerprint())];
      const snapshotBefore = await target.snapshot();
      const cases: Array<[string, Credentials, string, number]> = [
        ["port-55432", creds.withChanges({ port: 55432 }), "port", 0],
        ["port-5432", creds.withChanges({ port: 5432 }), "port", 0],
        ["database", creds.withChanges({ database: "platterly_platform" }), "database", 0],
        ["role", creds.withChanges({ role: "platterly_platform_app" }), "role", 0],
        ["sentinel-token", creds.withChanges({ token: "0".repeat(64) }), "sentinel-token", 1],
        ["cluster-identifier", creds.withChanges({ systemIdentifier: "1234567890123456789" }), "system-id", 1],
      ];
      for (const [label, mutated, code, expectedConnects] of cases) {
        let connects = 0;
        const error = await openGuarded(mutated, {
          applicationName: `platform-stage2-guard:demo:${label}`,
          connect: async (c, app) => (connects++, defaultConnect(c, app)),
        }).then(
          () => null,
          (e: unknown) => e,
        );
        expect(error, label).toBeInstanceOf(GuardRefusal);
        expect((error as GuardRefusal).code, label).toBe(code);
        expect(connects, `${label}: connections made`).toBe(expectedConnects);
        console.log(`refused ${label}: ${code} (connections made: ${connects})`);
      }
      expect([...(await target.staticFingerprint()), ...(await target.contentFingerprint())]).toEqual(guardBefore);
      expect(await target.snapshot()).toEqual(snapshotBefore);
    }));

  it("snapshot-A-diff: snapshot A of the catalogue, and Prisma sees no difference from the schema", () =>
    run.step("snapshot-A-diff", async () => {
      snapshotA = await target.snapshot();
      expect(snapshotA.length).toBeGreaterThan(20);
      writeSnapshotFile("snapshot-A.json", snapshotA);
      const diff = runPrisma(creds, ["migrate", "diff", "--from-config-datasource", "--to-schema", schemaPath(), "--exit-code"]);
      expect(diff.leaked).toBe(false);
      expect(diff.status, `${diff.stdout}\n${diff.stderr}`).toBe(0);
      console.log(`migrate diff exit ${diff.status}: ${diff.stdout.trim().split("\n").slice(-2).join(" / ")}`);
    }));

  it("atomicity-check: the rollback file and the history-row delete are rolled back together", () =>
    run.step("atomicity-check", async () => {
      const check = checkDownSql(identityDownSql(), identityUpSql());
      expect(check.ok).toBe(true);
      await target.downTransaction(identityDownSql(), identityUpSql(), IDENTITY_MIGRATION, false);
      expect(await target.snapshot()).toEqual(snapshotA);
      const verdict = checkHistory(await target.migrationRows(), migrationFolders());
      expect(verdict.ok ? [] : verdict.problems).toEqual([]);
    }));

  it("down: the rollback removes the three tables and exactly the identity history row", () =>
    run.step("down", async () => {
      await target.downTransaction(identityDownSql(), identityUpSql(), IDENTITY_MIGRATION, true);
      expect(await target.publicRelations()).toEqual(["_prisma_migrations"]);
      const rows = await target.migrationRows();
      expect(rows.map((r) => r.migration_name)).toEqual([BASELINE_MIGRATION]);
      const verdict = checkHistoryAfterDown(rows, migrationFolders(), IDENTITY_MIGRATION);
      expect(verdict.ok ? [] : verdict.problems).toEqual([]);
    }));

  it("deploy-2: migrate deploy applies the identity migration again with the same checksum", () =>
    run.step("deploy-2", async () => {
      const result = deploy("deploy-2");
      expect(result.stdout).toContain(IDENTITY_MIGRATION);
      const rows = await target.migrationRows();
      const verdict = checkHistory(rows, migrationFolders());
      expect(verdict.ok ? [] : verdict.problems).toEqual([]);
      expect(rows.find((r) => r.migration_name === IDENTITY_MIGRATION)?.checksum).toBe(firstChecksum);
      expect(await target.publicRelations()).toEqual(["_prisma_migrations", ...IDENTITY_TABLES].sort());
    }));

  it("snapshot-B-compare-write: snapshot B equals snapshot A and the tables are empty", () =>
    run.step("snapshot-B-compare-write", async () => {
      const snapshotB = await target.snapshot();
      const diff = diffSnapshots(snapshotA, snapshotB);
      expect(diff, "snapshot B differs from snapshot A").toEqual({ equal: true, onlyInA: [], onlyInB: [] });
      writeSnapshotFile("snapshot-B.json", snapshotB);
      expect(await target.identityCounts()).toEqual({ legacy_mappings: 0, user_identities: 0, users: 0 });
      console.log(`snapshots A and B: ${snapshotB.length} lines each, identical`);
    }));

  it("finish: the round trip run completes", () => run.finish());
});
