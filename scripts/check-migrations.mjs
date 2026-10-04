// Fails when a NEW migration (one not in migrations-baseline.txt) can remove or rewrite existing data,
// unless the file carries an explicit approval line: `-- data-safe-approved: <why no data is lost>`.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "prisma", "migrations");

export const RISKY = [
  [/\bDROP\s+TABLE\b/i, "drops a table"],
  [/\bDROP\s+COLUMN\b/i, "drops a column"],
  [/\bDROP\s+TYPE\b/i, "drops an enum type"],
  [/\bDROP\s+SCHEMA\b/i, "drops a schema"],
  [/\bTRUNCATE\b/i, "truncates a table"],
  [/\bDELETE\s+FROM\b/i, "deletes rows"],
  [/\bUPDATE\s+"?[\w.]+"?\s+SET\b/i, "rewrites existing rows (check it is a safe backfill)"],
  [/\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i, "changes a column type (can lose or fail on data)"],
  [/\bALTER\s+COLUMN\s+"?\w+"?\s+SET\s+NOT\s+NULL\b/i, "makes a column required (fails or needs a backfill)"],
  [/\bRENAME\s+(COLUMN|TO)\b/i, "renames (looks like a drop plus an add to Prisma)"],
  [/\bON\s+DELETE\s+CASCADE\b/i, "adds a cascading delete"],
];
const APPROVAL = /^--\s*data-safe-approved:[ \t]*\S.+$/im;

export function findProblems(sql) {
  if (APPROVAL.test(sql)) return [];
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  return RISKY.filter(([re]) => re.test(code)).map(([, why]) => why);
}

export function check() {
  const baseline = new Set(readFileSync(join(here, "migrations-baseline.txt"), "utf8").split("\n").filter(Boolean));
  const failures = [];
  for (const name of readdirSync(dir)) {
    if (name === "migration_lock.toml" || baseline.has(name)) continue;
    const problems = findProblems(readFileSync(join(dir, name, "migration.sql"), "utf8"));
    if (problems.length) failures.push({ name, problems });
  }
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = check();
  if (!failures.length) {
    console.log("Migration safety check passed.");
  } else {
    for (const f of failures) console.error(`\n${f.name}\n  - ${f.problems.join("\n  - ")}`);
    console.error("\nThese migrations can change or remove kitchens' data. Use expand/contract (see docs/data-safety.md).\nIf one is truly safe, add a line: -- data-safe-approved: <reason>");
    process.exit(1);
  }
}
