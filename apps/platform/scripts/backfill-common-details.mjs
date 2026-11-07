// Fills the common details (first name, last name, phone) of people who were imported before the Account kept them. It copies from Caterly's user table
// into the identity database and ONLY into empty fields: a value the person already has is never replaced. People are matched by id (the import kept
// Caterly's id), never by email. A dry run is the default; pass --apply to write. The report holds counts only (no name, phone or email).
//   CATERLY_DATABASE_URL=... IDENTITY_DATABASE_URL=... node scripts/backfill-common-details.mjs [--apply]
import pg from "pg";

const strip = (u) => u.replace(/\?.*$/, "");
const apply = process.argv.includes("--apply");
const caterlyUrl = process.env.CATERLY_DATABASE_URL;
const identityUrl = process.env.IDENTITY_DATABASE_URL;
if (!caterlyUrl || !identityUrl) throw new Error("set CATERLY_DATABASE_URL and IDENTITY_DATABASE_URL");

const source = new pg.Pool({ connectionString: strip(caterlyUrl), max: 1 });
const target = new pg.Pool({ connectionString: identityUrl, max: 1 });
try {
  const people = (await source.query(`select id, "firstName", "lastName", phone from "user" where "firstName" is not null or "lastName" is not null or phone is not null`)).rows;
  const client = await target.connect();
  const report = { checked: people.length, peopleUpdated: 0, firstNamesFilled: 0, lastNamesFilled: 0, phonesFilled: 0, applied: apply };
  try {
    await client.query("begin");
    for (const p of people) {
      const now = (await client.query(`select "firstName", "lastName", phone from "user" where id = $1`, [p.id])).rows[0];
      if (!now) continue;
      const first = !now.firstName && p.firstName ? p.firstName : null;
      const last = !now.lastName && p.lastName ? p.lastName : null;
      const phone = !now.phone && p.phone ? p.phone : null;
      if (!first && !last && !phone) continue;
      await client.query(`update "user" set "firstName" = coalesce("firstName", $2), "lastName" = coalesce("lastName", $3), phone = coalesce(phone, $4) where id = $1`, [p.id, first, last, phone]);
      report.peopleUpdated++;
      if (first) report.firstNamesFilled++;
      if (last) report.lastNamesFilled++;
      if (phone) report.phonesFilled++;
    }
    await client.query(apply ? "commit" : "rollback");
  } finally {
    client.release();
  }
  console.log(apply ? "APPLIED" : "DRY RUN (nothing written)", JSON.stringify(report));
} finally {
  await source.end();
  await target.end();
}
