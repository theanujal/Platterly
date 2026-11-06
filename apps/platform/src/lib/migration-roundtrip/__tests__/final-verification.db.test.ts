import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkHistory } from "../history";
import { diffSnapshots } from "../inventory";
import { Credentials, GuardedTarget, IDENTITY_TABLES, RunSequence, STAGE2_DIR, loadCredentials, migrationFolders, openGuarded, readFingerprintFile, readSnapshotFile } from "./db-target";

// Run 4 of 4 (final verification): read-only. It checks the protected fingerprint file and the live guard, the catalogue against snapshot B,
// the migration history, the empty identity tables, and the whole run chain. It changes nothing.
const credentials = loadCredentials(process.env.PLATFORM_TEST_CREDENTIALS_DIR);

// The first round-trip attempt failed at its reset rehearsal because the dependency check wrongly counted internal TOAST relations. Its record is kept.
const FAILED_FIRST_ATTEMPT = "5a71b8b6-53c8-4202-b79d-025f972bb9e8";

const EXPECTED_STEPS: Record<string, string[]> = {
  "start:roundtrip": ["reset", "deploy-1", "history-checksum", "reset-rehearsal", "refusal-demos", "snapshot-A-diff", "atomicity-check", "down", "deploy-2", "snapshot-B-compare-write", "complete"],
  "start:constraints": ["preconditions", "ascii-matrix", "ascii-v-and-ends", "unicode-corpus", "constraints-other", "column-types", "tables-still-empty", "complete"],
  "start:db-test": ["preconditions", "tables-and-history", "db-test-checks", "complete"],
};

// R4 verifies the identity-era state recorded by runs 1 to 3 (snapshot B, the run chain). It runs only while the identity migration is the last one;
// the organisation migration has its own round trip (org-roundtrip.db.test.ts) and constraint tests.
const onlyIdentityMigrations = migrationFolders().length <= 2;

describe.skipIf(credentials === null || !onlyIdentityMigrations)("R4 final read-only verification (isolated test database)", () => {
  const creds = credentials as Credentials;
  let target: GuardedTarget;
  let run: RunSequence;

  beforeAll(async () => {
    target = await openGuarded(creds, { applicationName: "platform-stage2-guard:final-verification" });
    run = await target.beginRun("final-verification");
    console.log(`R4 run id: ${run.runId}`);
  });

  afterAll(async () => {
    try {
      await run?.abandonIfOpen();
    } finally {
      await target?.close();
    }
  });

  it("fingerprint-file-checks: the protected file is the one recorded at setup", () =>
    run.step("fingerprint-file-checks", async () => {
      const file = readFingerprintFile(STAGE2_DIR);
      const recorded = readFileSync(path.join(STAGE2_DIR, "manifests", "fingerprint-file.sha256"), "utf8").trim();
      expect(file.fileSha256).toBe(recorded);
      console.log(`fingerprint file: ${file.lines.length} lines, content checksum ${file.sha256.slice(0, 16)}..., file sha256 ${file.fileSha256.slice(0, 16)}... (matches the setup record)`);
    }));

  it("fingerprint-compare: the live guard schema equals the protected file", () =>
    run.step("fingerprint-compare", async () => {
      expect(await target.staticFingerprint()).toEqual(readFingerprintFile(STAGE2_DIR).lines);
    }));

  it("catalogue-vs-snapshot-B: the public catalogue is the one recorded after the round trip", () =>
    run.step("catalogue-vs-snapshot-B", async () => {
      const diff = diffSnapshots(readSnapshotFile("snapshot-B.json"), await target.snapshot());
      expect(diff).toEqual({ equal: true, onlyInA: [], onlyInB: [] });
      expect(diffSnapshots(readSnapshotFile("snapshot-A.json"), readSnapshotFile("snapshot-B.json")).equal).toBe(true);
    }));

  it("history-and-tables: both migrations recorded with matching checksums, the identity tables exist and are empty", () =>
    run.step("history-and-tables", async () => {
      const rows = await target.migrationRows();
      const verdict = checkHistory(rows, migrationFolders());
      expect(verdict.ok ? [] : verdict.problems).toEqual([]);
      expect(await target.publicRelations()).toEqual(["_prisma_migrations", ...IDENTITY_TABLES].sort());
      expect(await target.identityCounts()).toEqual({ legacy_mappings: 0, user_identities: 0, users: 0 });
    }));

  it("run-chain-check: the failed first attempt stays failed and recovered; runs 2 to 4 finished in order, chained to each other", () =>
    run.step("run-chain-check", async () => {
      const started = await target.readQuery("select run_id, step_name, previous_run_id from runner_guard.run_log where status = 'started' order by at");
      expect(started.map((r) => r.step_name)).toEqual(["start:roundtrip", "start:roundtrip", "start:constraints", "start:db-test", "start:final-verification"]);
      expect(started.map((r) => r.previous_run_id ?? null)).toEqual([null, started[0].run_id, started[1].run_id, started[2].run_id, started[3].run_id]);
      const states = new Map((await target.runStates()).map((r) => [String(r.run_id), r]));
      const stepsOf = (runId: unknown) => target.readQuery("select step_no, status, step_name from runner_guard.run_log where run_id = $1 order by step_no", [runId]);

      // The failed first attempt: kept exactly as it happened. It stays failed; a recovery record settles it, nothing rewrites it.
      expect(String(started[0].run_id)).toBe(FAILED_FIRST_ATTEMPT);
      const failed = states.get(FAILED_FIRST_ATTEMPT);
      expect(failed?.outcome).toBe("failed");
      expect(failed?.recovered).toBe(true);
      expect(failed?.settled).toBe(true);
      const failedSteps = await stepsOf(FAILED_FIRST_ATTEMPT);
      expect(failedSteps.map((r) => `${r.status}:${r.step_name}`)).toEqual(["started:start:roundtrip", "step:reset", "step:deploy-1", "step:history-checksum", "failed:reset-rehearsal"]);
      const recoveries = await target.readQuery("select recovered_run_id, approved_by, recorded_by from runner_guard.recovery_log");
      expect(recoveries).toHaveLength(1);
      expect(String(recoveries[0].recovered_run_id)).toBe(FAILED_FIRST_ATTEMPT);
      expect(recoveries[0].recorded_by).toBe("pgadmin");
      expect(String(recoveries[0].approved_by).trim()).not.toBe("");

      // The fresh runs: each finished, each with exactly its own steps.
      const fresh: Array<[number, string]> = [[1, "start:roundtrip"], [2, "start:constraints"], [3, "start:db-test"]];
      for (const [index, name] of fresh) {
        const row = started[index];
        const state = states.get(String(row.run_id));
        expect(state?.outcome, name).toBe("finished");
        expect(state?.recovered).toBe(false);
        const steps = await stepsOf(row.run_id);
        expect(steps.map((s) => Number(s.step_no))).toEqual(steps.map((_, i) => i + 1));
        expect(steps[0].status).toBe("started");
        expect(steps.at(-1)?.status).toBe("finished");
        expect(steps.slice(1, -1).every((s) => s.status === "step")).toBe(true);
        expect(steps.slice(1).map((s) => s.step_name)).toEqual(EXPECTED_STEPS[name]);
        console.log(`${name}: run ${row.run_id} finished after ${steps.length} rows`);
      }
      console.log(`first attempt ${FAILED_FIRST_ATTEMPT}: failed at reset-rehearsal, recovered by a recovery_log record, history intact`);
      expect(states.get(String(started[4].run_id))?.outcome).toBe("interrupted"); // this run, still open until its own finish
      expect(Number((await target.readQuery("select count(*)::int as n from runner_guard.sentinel"))[0].n)).toBe(1);
    }));

  it("finish: the final verification run completes", () => run.finish());
});
