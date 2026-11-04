import { describe, expect, it } from "vitest";
import { checkHistory, checkHistoryAfterDown, migrationChecksum, type HistoryRow, type MigrationFolder } from "../history";
import { classifyInventory, diffSnapshots, objectKey, type Inventory, type InventoryPolicy } from "../inventory";

const folders: MigrationFolder[] = [
  { name: "20261101000000_baseline", sql: "-- baseline\n" },
  { name: "20261104190000_identity_tables", sql: 'CREATE TABLE "users" ("id" UUID);\n' },
];
const row = (f: MigrationFolder, patch: Partial<HistoryRow> = {}): HistoryRow => ({
  migration_name: f.name,
  checksum: migrationChecksum(f.sql),
  finished_at: new Date("2026-11-04T00:00:00Z"),
  rolled_back_at: null,
  ...patch,
});
const problemsOf = (result: { ok: boolean; problems?: string[] }) => (result.ok ? [] : (result.problems ?? []));

describe("migration checksum (provisional: SHA-256 hex of the file text)", () => {
  it("is the SHA-256 hex digest, stable for text and bytes", () => {
    expect(migrationChecksum("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(migrationChecksum(new TextEncoder().encode("abc"))).toBe(migrationChecksum("abc"));
    expect(migrationChecksum("abc ")).not.toBe(migrationChecksum("abc"));
  });
});

describe("history check", () => {
  it("accepts rows that are exactly the folders, finished and matching, in any order", () => {
    expect(checkHistory(folders.map((f) => row(f)), folders)).toEqual({ ok: true });
    expect(checkHistory([...folders].reverse().map((f) => row(f)), folders)).toEqual({ ok: true });
  });

  it("refuses a missing row, an extra row and a duplicate row", () => {
    expect(problemsOf(checkHistory([row(folders[0])], folders))).toContain("history has no row for 20261104190000_identity_tables");
    const extra: HistoryRow = { ...row(folders[0]), migration_name: "20270101000000_unknown" };
    expect(problemsOf(checkHistory([...folders.map((f) => row(f)), extra], folders))).toContain("history has a row for 20270101000000_unknown, which has no folder");
    expect(problemsOf(checkHistory([...folders.map((f) => row(f)), row(folders[0])], folders))).toContain("history lists 20261101000000_baseline more than once");
  });

  it("refuses an unfinished, rolled-back or checksum-mismatched row", () => {
    expect(problemsOf(checkHistory([row(folders[0]), row(folders[1], { finished_at: null })], folders))).toContain("20261104190000_identity_tables is not finished");
    expect(problemsOf(checkHistory([row(folders[0]), row(folders[1], { rolled_back_at: new Date() })], folders))).toContain("20261104190000_identity_tables is marked rolled back");
    expect(problemsOf(checkHistory([row(folders[0], { checksum: "0".repeat(64) }), row(folders[1])], folders))).toContain("20261101000000_baseline checksum does not match its file");
  });

  it("after the down step expects only the other migrations and no row for the target", () => {
    const target = folders[1].name;
    expect(checkHistoryAfterDown([row(folders[0])], folders, target)).toEqual({ ok: true });
    expect(problemsOf(checkHistoryAfterDown(folders.map((f) => row(f)), folders, target))).toContain(`history still has a row for ${target}`);
    expect(problemsOf(checkHistoryAfterDown([], folders, target))).toContain("history has no row for 20261101000000_baseline");
    expect(problemsOf(checkHistoryAfterDown([row(folders[0])], folders, "nope"))).toEqual(["nope is not one of the migration folders"]);
  });
});

const policy: InventoryPolicy = {
  allowedSchemas: ["public", "runner_guard"],
  allowedExtensions: ["plpgsql"],
  allowedObjects: ["table:public._prisma_migrations", "table:public.users", "table:runner_guard.sentinel", "table:runner_guard.run_log"],
};
const clean: Inventory = {
  schemas: ["public", "runner_guard"],
  extensions: ["plpgsql"],
  objects: [{ schema: "runner_guard", kind: "table", name: "sentinel" }, { schema: "runner_guard", kind: "table", name: "run_log" }],
  rowCounts: {},
  otherSessions: 0,
  runLog: [],
};

describe("inventory check", () => {
  it("builds object keys", () => {
    expect(objectKey({ schema: "public", kind: "table", name: "users" })).toBe("table:public.users");
  });

  it("allows a reset of an empty test database and of empty expected tables", () => {
    expect(classifyInventory(clean, policy)).toEqual({ ok: true, recovery: false });
    const migrated: Inventory = { ...clean, objects: [...clean.objects, { schema: "public", kind: "table", name: "users" }, { schema: "public", kind: "table", name: "_prisma_migrations" }], rowCounts: { "public.users": 0, "public._prisma_migrations": 0 } };
    expect(classifyInventory(migrated, policy)).toEqual({ ok: true, recovery: false });
  });

  it("refuses unknown schemas, extensions and objects", () => {
    expect(classifyInventory({ ...clean, schemas: [...clean.schemas, "extra"] }, policy)).toEqual({ ok: false, reasons: ["unexpected schema extra"] });
    expect(classifyInventory({ ...clean, extensions: ["plpgsql", "pgcrypto"] }, policy)).toEqual({ ok: false, reasons: ["unexpected extension pgcrypto"] });
    expect(classifyInventory({ ...clean, objects: [...clean.objects, { schema: "public", kind: "table", name: "customers" }] }, policy)).toEqual({ ok: false, reasons: ["unexpected table public.customers"] });
    expect(classifyInventory({ ...clean, objects: [...clean.objects, { schema: "public", kind: "function", name: "f" }] }, policy).ok).toBe(false);
  });

  it("refuses rows with no unfinished earlier run", () => {
    expect(classifyInventory({ ...clean, rowCounts: { "public.users": 3 } }, policy)).toEqual({ ok: false, reasons: ["public.users holds 3 row(s) and no unfinished earlier run explains it"] });
    expect(classifyInventory({ ...clean, rowCounts: { "public.users": 3 }, runLog: [{ runId: "a", status: "finished" }] }, policy).ok).toBe(false);
  });

  it("allows leftover rows only as recovery from an unfinished run, and still refuses unknown objects", () => {
    const leftover: Inventory = { ...clean, rowCounts: { "public.users": 3 }, runLog: [{ runId: "a", status: "started" }] };
    expect(classifyInventory(leftover, policy)).toEqual({ ok: true, recovery: true });
    expect(classifyInventory({ ...leftover, schemas: [...leftover.schemas, "extra"] }, policy).ok).toBe(false);
  });

  it("refuses while another session is connected", () => {
    expect(classifyInventory({ ...clean, otherSessions: 1 }, policy)).toEqual({ ok: false, reasons: ["1 other session(s) are connected"] });
  });

  it("lists every reason", () => {
    const result = classifyInventory({ ...clean, otherSessions: 2, schemas: ["public", "x"], rowCounts: { "public.users": 1 } }, policy);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.reasons).toHaveLength(3);
  });
});

describe("snapshot diff", () => {
  it("treats the same lines in any order as equal", () => {
    expect(diffSnapshots(["a", "b", "b"], ["b", "a", "b"])).toEqual({ equal: true, onlyInA: [], onlyInB: [] });
    expect(diffSnapshots([], [])).toEqual({ equal: true, onlyInA: [], onlyInB: [] });
  });

  it("reports differences and repeated lines", () => {
    expect(diffSnapshots(["a", "b"], ["a", "c"])).toEqual({ equal: false, onlyInA: ["b"], onlyInB: ["c"] });
    expect(diffSnapshots(["a", "a"], ["a"])).toEqual({ equal: false, onlyInA: ["a"], onlyInB: [] });
  });
});
