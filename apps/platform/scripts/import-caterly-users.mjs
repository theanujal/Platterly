// F4.1.3: import Caterly users (and password hashes) from a COPY of Caterly's user and account tables into the identity database.
//   CATERLY_COPY_DATABASE_URL=... IDENTITY_DATABASE_URL=... node scripts/import-caterly-users.mjs            (dry run: nothing is written)
//   CATERLY_COPY_DATABASE_URL=... IDENTITY_DATABASE_URL=... node scripts/import-caterly-users.mjs --apply    (writes)
import pg from "pg";
import { importCaterlyUsers } from "../src/modules/auth/legacy-import.mjs";

const sourceUrl = process.env.CATERLY_COPY_DATABASE_URL;
const targetUrl = process.env.IDENTITY_DATABASE_URL;
if (!sourceUrl || !targetUrl) throw new Error("CATERLY_COPY_DATABASE_URL and IDENTITY_DATABASE_URL must be set");
const dbName = (url) => new URL(url).pathname.replace(/^\//, "");
const port = (url) => new URL(url).port || "5432";
// The source must say it is a copy; the live and shared databases are refused by name and by port.
if (!/copy/i.test(dbName(sourceUrl)) || port(sourceUrl) === "5432" || port(sourceUrl) === "55432") throw new Error("the source must be a COPY database (name contains 'copy', not on 5432 or 55432)");
if (port(targetUrl) === "5432" || port(targetUrl) === "55432" || port(targetUrl) === "55433") throw new Error("the identity target must be on the F4 cluster, not 5432, 55432 or 55433");

const apply = process.argv.includes("--apply");
const source = new pg.Pool({ connectionString: sourceUrl, max: 1 });
const target = new pg.Pool({ connectionString: targetUrl, max: 1 });
try {
  const { addedUserIds, conflictUserIds, ...counts } = await importCaterlyUsers({ source, target, apply });
  console.log(apply ? "APPLIED" : "DRY RUN (nothing written)");
  console.log(JSON.stringify({ ...counts, addedUserIdCount: addedUserIds.length, conflictUserIds }, null, 2));
} finally {
  await source.end();
  await target.end();
}
