// Pure checks of Prisma's migration history against the migration folders. Rows and file text are arguments: nothing is read or queried here.
import { createHash } from "node:crypto";

// PROVISIONAL: Prisma's checksum is understood to be the SHA-256 (hex) of the migration.sql bytes. Stage 2 must confirm it against a real
// _prisma_migrations row before any check built on it is trusted.
export function migrationChecksum(sql: string | Uint8Array): string {
  return createHash("sha256").update(sql).digest("hex");
}

export type HistoryRow = {
  migration_name: string;
  checksum: string;
  finished_at: Date | string | null;
  rolled_back_at: Date | string | null;
};

export type MigrationFolder = { name: string; sql: string | Uint8Array };

export type HistoryCheck = { ok: true } | { ok: false; problems: string[] };

// The rows must be exactly the folders: same names, none twice, all finished and none rolled back, each checksum matching its file.
export function checkHistory(rows: readonly HistoryRow[], folders: readonly MigrationFolder[]): HistoryCheck {
  const problems: string[] = [];
  const names = rows.map((r) => r.migration_name);
  for (const name of new Set(names)) {
    if (names.indexOf(name) !== names.lastIndexOf(name)) problems.push(`history lists ${name} more than once`);
  }
  for (const folder of folders) {
    const row = rows.find((r) => r.migration_name === folder.name);
    if (!row) {
      problems.push(`history has no row for ${folder.name}`);
      continue;
    }
    if (row.finished_at == null) problems.push(`${folder.name} is not finished`);
    if (row.rolled_back_at != null) problems.push(`${folder.name} is marked rolled back`);
    if (row.checksum !== migrationChecksum(folder.sql)) problems.push(`${folder.name} checksum does not match its file`);
  }
  for (const row of rows) {
    if (!folders.some((f) => f.name === row.migration_name)) problems.push(`history has a row for ${row.migration_name}, which has no folder`);
  }
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

// After the down step: exactly the other migrations remain and the target's row is gone.
export function checkHistoryAfterDown(rows: readonly HistoryRow[], folders: readonly MigrationFolder[], target: string): HistoryCheck {
  if (!folders.some((f) => f.name === target)) return { ok: false, problems: [`${target} is not one of the migration folders`] };
  const problems: string[] = [];
  if (rows.some((r) => r.migration_name === target)) problems.push(`history still has a row for ${target}`);
  const rest = checkHistory(rows, folders.filter((f) => f.name !== target));
  if (!rest.ok) problems.push(...rest.problems);
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
