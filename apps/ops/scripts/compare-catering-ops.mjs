// Read-only go-live check: every catering business next to what Ops has for it, as a table to decide row by row ("keep catering" or "keep Ops").
//   npm run ops:compare-catering            (source: CATERING_DATABASE_URL, else DATABASE_URL in the repo root .env; target: DATABASE_URL of apps/ops)
// Nothing is written: both connections are read-only transactions. A business matches by catering's organization.businessId = Ops business.id.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "-");
const show = (s) => (s ? `${s.status} · ${s.plan ?? "?"} · ${s.interval ?? "-"} · trial ends ${day(s.trialEndsAt)} · period ends ${day(s.currentPeriodEnd)}` : "no subscription");
const same = (a, b) => a && b && a.status === b.status && (a.plan ?? "") === (b.plan ?? "") && (a.interval ?? null) === (b.interval ?? null) && day(a.trialEndsAt) === day(b.trialEndsAt) && day(a.currentPeriodEnd) === day(b.currentPeriodEnd);

const source = new pg.Client({ connectionString: sourceDb });
const target = new pg.Client({ connectionString: targetDb });
await source.connect();
await target.connect();
try {
  await source.query("begin read only");
  await target.query("begin read only");
  const { rows: orgs } = await source.query(`
    select o."businessId" as "businessId", o.name,
      (select u.email from member m join "user" u on u.id = m."userId" where m."organizationId" = o.id and m.role = 'owner' order by m."createdAt" limit 1) as owner,
      s.status, s."billingInterval" as interval, s."trialEndsAt", s."currentPeriodEnd", p.name as plan
    from organization o
    left join lateral (select * from subscription x where x."organizationId" = o.id and x."endDate" is null order by x."createdAt" desc limit 1) s on true
    left join subscription_plan p on p.id = s."subscriptionPlanId"
    order by o.name`);
  const { rows: ops } = await target.query(`
    select b.id, b.name, s.status, s."billingInterval" as interval, s."trialEndsAt", s."currentPeriodEnd", p.name as plan
    from business b
    left join lateral (select * from subscription x where x."businessId" = b.id and x."productKey" = 'catering' and x."endDate" is null order by x."createdAt" desc limit 1) s on true
    left join plan p on p.id = s."planId"`);
  const byId = new Map(ops.map((r) => [r.id, r]));
  const seen = new Set();
  const counts = { SAME: 0, DIFFERENT: 0, "NOT IN OPS": 0 };
  console.log("| Business | Owner | Catering has | Ops has | Verdict | Your decision (catering / Ops) |\n|---|---|---|---|---|---|");
  for (const o of orgs) {
    const r = o.businessId ? byId.get(o.businessId) : undefined;
    if (r) seen.add(r.id);
    const verdict = !r ? "NOT IN OPS" : same(o, r) ? "SAME" : "DIFFERENT";
    counts[verdict]++;
    console.log(`| ${o.name} | ${o.owner ?? "-"} | ${show(o.status ? o : null)} | ${r ? show(r.status ? r : null) : "-"} | ${verdict} | |`);
  }
  const onlyOps = ops.filter((r) => !seen.has(r.id));
  console.log(`\nCatering businesses: ${orgs.length}. SAME ${counts.SAME}, DIFFERENT ${counts.DIFFERENT}, NOT IN OPS ${counts["NOT IN OPS"]}. Businesses only in Ops (not a catering business): ${onlyOps.length}.`);
  console.log("Nothing was changed.");
} finally {
  await source.query("rollback").catch(() => {});
  await target.query("rollback").catch(() => {});
  await source.end();
  await target.end();
}
