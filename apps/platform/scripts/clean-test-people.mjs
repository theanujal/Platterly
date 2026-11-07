// DEV ONLY: removes the throwaway people the browser tests register (every address ending @auth.test) from the identity database and from the Platform
// database (their sign-in links, mappings and product slots with them). Real accounts never end in @auth.test, so they are never touched. The Platform's
// append-only audit rows are not deleted (the database forbids it by design). Dry run by default; --apply deletes.
//   source ~/.platterly/f4dev/env.sh && node scripts/clean-test-people.mjs [--apply]
import pg from "pg";

const identityUrl = process.env.IDENTITY_DATABASE_URL;
const platformUrl = process.env.DATABASE_URL;
if (!identityUrl || !platformUrl) throw new Error("run after `source ~/.platterly/f4dev/env.sh` (IDENTITY_DATABASE_URL and DATABASE_URL)");
for (const url of [identityUrl, platformUrl]) {
  const port = new URL(url).port || "5432";
  if (["5432", "55432", "55433"].includes(port)) throw new Error(`refusing port ${port}: this only runs against the F4 cluster`);
}
const apply = process.argv.includes("--apply");
const PATTERN = "%@auth.test";
const identity = new pg.Pool({ connectionString: identityUrl, max: 1 });
const platform = new pg.Pool({ connectionString: platformUrl, max: 1 });
const count = async (pool, sql) => Number((await pool.query(sql, [PATTERN])).rows[0].n);
try {
  const before = { identityPeople: await count(identity, `select count(*) n from "user" where email like $1`), platformPeople: await count(platform, `select count(*) n from users where email like $1`) };
  console.log(apply ? "APPLYING" : "DRY RUN (nothing deleted)", JSON.stringify(before));
  if (apply) {
    // Platform first (its links point at identity subjects), then identity. Each in its own transaction.
    const c = await platform.connect();
    try {
      await c.query("begin");
      const ids = `(select id from users where email like $1)`;
      for (const t of ["membership_product_slots", "user_identities", "legacy_mappings"]) await c.query(`delete from ${t} where user_id in ${ids}`, [PATTERN]);
      await c.query(`delete from users where email like $1`, [PATTERN]);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    await identity.query(`delete from "user" where email like $1`, [PATTERN]); // sessions and accounts cascade
    await identity.query(`delete from verification where identifier like $1`, [PATTERN]);
    console.log("DONE", JSON.stringify({ identityPeople: await count(identity, `select count(*) n from "user" where email like $1`), platformPeople: await count(platform, `select count(*) n from users where email like $1`) }));
  }
} finally {
  await identity.end();
  await platform.end();
}
