// DEV ONLY: removes the throwaway businesses the browser tests leave in Ops (owner address ending @example.test or @auth.test) with their product links,
// subscriptions and alerts (they cascade). Real owners never use those domains. A business with a recorded payment is never removed, and the script
// refuses anything but the local database. Dry run by default; --apply deletes.
//   node scripts/clean-test-businesses.mjs [--apply]
import pg from "pg";

// The URL is read from apps/ops/.env itself, never from the shell: another app's DATABASE_URL in the environment must not redirect this script.
import { readFileSync } from "node:fs";
const line = readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
const url = line?.slice("DATABASE_URL=".length).replace(/^"|"$/g, "").replace(/\?schema=public$/, "");
if (!url) throw new Error("DATABASE_URL is not set (apps/ops/.env)");
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1"].includes(host)) throw new Error(`refusing host ${host}: this only runs against a local database`);
const apply = process.argv.includes("--apply");
const WHERE = `("ownerEmail" like '%@example.test' or "ownerEmail" like '%@auth.test') and id not in (select "businessId" from subscription_payment)`;
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const count = async () => Number((await pool.query(`select count(*) n from business where ${WHERE}`)).rows[0].n);
  const total = async () => Number((await pool.query("select count(*) n from business")).rows[0].n);
  console.log(apply ? "APPLYING" : "DRY RUN (nothing deleted)", JSON.stringify({ testBusinesses: await count(), allBusinesses: await total() }));
  if (apply) {
    await pool.query(`delete from business where ${WHERE}`);
    console.log("DONE", JSON.stringify({ testBusinesses: await count(), allBusinesses: await total() }));
  }
} finally {
  await pool.end();
}
