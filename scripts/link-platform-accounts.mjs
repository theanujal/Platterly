// F8.1.1 / F10: links Caterly users to their central Platterly identity, so the central sign-in finds the right Caterly user by account (never by email).
// A user that was imported into the identity database keeps its Caterly user id as the central subject (F4.1.3), so the link is the account row
// (provider "platterly", account id = that id). Dry run by default; --apply writes. Adds rows only: it never changes or removes anything that exists.
//   CATERLY_DATABASE_URL=...  IDENTITY_DATABASE_URL=...  node scripts/link-platform-accounts.mjs [--apply]
// On the live server (one Postgres, port 5432) add --production: the databases must then be platterly_catering and platterly_identity, on any port.
import pg from "pg";

const caterlyUrl = process.env.CATERLY_DATABASE_URL ?? process.env.DATABASE_URL;
const identityUrl = process.env.IDENTITY_DATABASE_URL;
if (!caterlyUrl || !identityUrl) throw new Error("CATERLY_DATABASE_URL (or DATABASE_URL) and IDENTITY_DATABASE_URL must be set");
const port = (u) => new URL(u).port || "5432";
const dbName = (u) => new URL(u).pathname.replace(/^\//, "");
if (process.argv.includes("--production")) {
  if (dbName(caterlyUrl) !== "platterly_catering" || dbName(identityUrl) !== "platterly_identity") throw new Error("with --production the databases must be platterly_catering and platterly_identity");
} else if (["55432", "55433"].includes(port(identityUrl)) || port(identityUrl) === port(caterlyUrl)) throw new Error("the identity database must be on the F4 cluster, apart from Caterly's database (a live server needs --production)");

const apply = process.argv.includes("--apply");
const caterly = new pg.Pool({ connectionString: caterlyUrl.replace(/\?.*$/, ""), max: 1 });
const identity = new pg.Pool({ connectionString: identityUrl, max: 1 });
try {
  const central = new Set((await identity.query(`select id from "user"`)).rows.map((r) => r.id));
  const users = (await caterly.query(`select id from "user"`)).rows.map((r) => r.id);
  const linked = new Set((await caterly.query(`select "userId" from account where "providerId" = 'platterly'`)).rows.map((r) => r.userId));
  const toLink = users.filter((id) => central.has(id) && !linked.has(id));
  const report = { caterlyUsers: users.length, centralIdentities: central.size, alreadyLinked: linked.size, toLink: toLink.length, caterlyOnly: users.filter((id) => !central.has(id)).length, applied: false };
  if (apply) {
    const client = await caterly.connect();
    try {
      await client.query("begin");
      for (const id of toLink)
        await client.query(`insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") values (gen_random_uuid()::text, $1, 'platterly', $1, now(), now())`, [id]);
      await client.query("commit");
      report.applied = true;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  console.log(apply ? "APPLIED" : "DRY RUN (nothing written)");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await caterly.end();
  await identity.end();
}
