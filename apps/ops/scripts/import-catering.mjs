// One-time import from catering into ops (step 6c). Dry run by default; --apply commits.
//   npm run ops:import-catering                 # dry run: does everything, checks it, then rolls back
//   npm run ops:import-catering -- --apply      # the same, then commits and raises the product's invoice number
// Catering is only ever READ (a read-only transaction). Source: CATERING_DATABASE_URL, else DATABASE_URL in the repo root .env.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runImport } from "./lib/catering-import.mjs";

const apply = process.argv.includes("--apply");

function sourceUrl() {
  if (process.env.CATERING_DATABASE_URL) return process.env.CATERING_DATABASE_URL;
  const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../.env"), "utf8");
  const match = /^DATABASE_URL="?([^"\n]+)"?/m.exec(env);
  if (!match) throw new Error("Set CATERING_DATABASE_URL (the catering database).");
  return match[1];
}
const strip = (url) => url.split("?")[0];

const sourceDb = strip(sourceUrl());
const targetDb = strip(process.env.DATABASE_URL ?? "");
if (!targetDb) throw new Error("DATABASE_URL (the ops database) is not set.");
if (sourceDb === targetDb) throw new Error("The catering and ops database URLs are the same. Refusing to run.");

const source = new pg.Client({ connectionString: sourceDb });
const target = new pg.Client({ connectionString: targetDb });
await source.connect();
await target.connect();
try {
  console.log(apply ? "APPLY: will commit when every check passes." : "DRY RUN: nothing will be kept. Add --apply to commit.");
  const result = await runImport({ source, target, dryRun: !apply, log: (e) => console.log(`Read from catering: ${e.plans} plans, ${e.subscriptions} subscriptions, ${e.payments} payments, ${e.organizations} businesses (${e.knownToOps} known to ops).`, "\nLeft out:", e.skipped) });
  if (result.errors.length) {
    console.error("\nNothing was imported. Fix these first:");
    for (const e of result.errors) console.error(" -", e);
    process.exitCode = 1;
  } else {
    console.log("\nWould add / added:", result.applied.inserted, "\nLeft alone because ops already has them:", result.applied.skippedExisting);
    console.log("\nReconciliation:");
    for (const c of result.reconciliation.checks) console.log(` ${c.ok ? "OK  " : "FAIL"} ${c.name}: catering ${JSON.stringify(c.expected)} / ops ${JSON.stringify(c.actual)}`);
    if (!result.reconciliation.ok) {
      console.error("\nA check failed. Everything was rolled back.");
      process.exitCode = 1;
    } else if (result.committed) {
      console.log(`\nCommitted. Invoice number: catering at ${result.sequence.catering}, ops ${result.sequence.opsBefore} -> ${result.sequence.opsAfter}.`);
    } else {
      console.log("\nDry run finished. Nothing was kept.");
    }
  }
} finally {
  await source.end();
  await target.end();
}
