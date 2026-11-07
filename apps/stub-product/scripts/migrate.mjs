// Applies migrations/*.sql to the stub's own database. Local only: refuses the shared and production-like ports.
//   source ~/.platterly/f4dev/stub-env.sh && node scripts/migrate.mjs                    (STUB_DATABASE_URL)
//   source ~/.platterly/f4dev/stub-env.sh && STUB_TARGET=test node scripts/migrate.mjs   (STUB_TEST_DATABASE_URL)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.STUB_TARGET === "test" ? process.env.STUB_TEST_DATABASE_URL : process.env.STUB_DATABASE_URL;
if (!url) throw new Error("STUB_DATABASE_URL (or STUB_TEST_DATABASE_URL with STUB_TARGET=test) is not set");
const port = new URL(url).port || "5432";
if (["5432", "55432", "55433"].includes(port)) throw new Error(`refusing port ${port}: the stub uses its own database on the F4 cluster`);
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(fs.readFileSync(path.join(dir, file), "utf8"));
    console.log(`applied ${file}`);
  }
} finally {
  await pool.end();
}
