// Go-live check (docs/go-live-order.md step 6): the business id is one id in three places. Read-only: it only runs SELECTs and prints counts and ids, never names,
// emails or phones. A business that exists in the Platform must exist in Ops and in catering under the same id, because approving an account deletion, billing and
// every product message find the business by that id.
//   CATERING_DATABASE_URL=... OPS_DATABASE_URL=... PLATFORM_DATABASE_URL=... node scripts/compare-business-ids.mjs
// Exit code 0 = every Platform organisation is known to Ops and catering. 1 = something differs (listed). Catering and Ops businesses the Platform has not
// heard of yet are reported, but they are expected until people are imported and linked, so they do not fail the check unless --strict is given.
import pg from "pg";

const urls = { catering: process.env.CATERING_DATABASE_URL, ops: process.env.OPS_DATABASE_URL, platform: process.env.PLATFORM_DATABASE_URL };
for (const [k, v] of Object.entries(urls)) if (!v) throw new Error(`${k.toUpperCase()}_DATABASE_URL must be set`);
const strict = process.argv.includes("--strict");
const strip = (u) => u.replace(/\?.*$/, "");
const ids = async (url, sql) => {
  const pool = new pg.Pool({ connectionString: strip(url), max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query("begin read only");
      const rows = (await client.query(sql)).rows.map((r) => r.id);
      await client.query("rollback");
      return new Set(rows);
    } finally { client.release(); }
  } finally { await pool.end(); }
};

const catering = await ids(urls.catering, `select "businessId" as id from organization where "businessId" is not null`);
const ops = await ids(urls.ops, `select id from business`);
const platform = await ids(urls.platform, `select id from organisations`);
const missing = (from, into) => [...from].filter((id) => !into.has(id)).sort();
const report = {
  counts: { catering: catering.size, ops: ops.size, platform: platform.size },
  platformNotInOps: missing(platform, ops),
  platformNotInCatering: missing(platform, catering),
  opsNotInCatering: missing(ops, catering),
  cateringNotInOps: missing(catering, ops),
  cateringNotInPlatform: missing(catering, platform),
  opsNotInPlatform: missing(ops, platform),
};
console.log(JSON.stringify({ ...report, cateringNotInPlatform: report.cateringNotInPlatform.length, opsNotInPlatform: report.opsNotInPlatform.length, detailNote: "the two not-in-Platform lists are counts only; use --strict to list them" }, null, 2));
if (strict) console.log(JSON.stringify({ cateringNotInPlatform: report.cateringNotInPlatform, opsNotInPlatform: report.opsNotInPlatform }, null, 2));
const hard = report.platformNotInOps.length + report.platformNotInCatering.length + (strict ? report.cateringNotInPlatform.length + report.opsNotInPlatform.length : 0);
console.log(hard === 0 ? "OK: every Platform business is known to Ops and catering under the same id." : `DIFFERENCES: ${hard} id(s) do not line up (see the lists above).`);
process.exit(hard === 0 ? 0 : 1);
