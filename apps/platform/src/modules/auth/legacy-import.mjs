// F4.1.3: copies Caterly's people and their password hashes into the identity database, so an existing Caterly user can sign in at Platterly with the
// same password. Reads a COPY of Caterly's user and account tables (never the live database) and writes the identity database only.
//   - Better Auth's default password hash is used by both apps, so a hash is copied unchanged and verifies unchanged (no reset needed).
//   - The Caterly user id is kept as the identity user id (one id to reconcile with).
//   - It never overwrites: a user that is already there (same id) is left alone, and a different user already holding the same email is reported
//     as a conflict and skipped, together with its password.
//   - The email is lower-cased; `emailVerified` is copied as it is, so someone Caterly never verified still has to verify before signing in.
//   - Only people and their password accounts are copied: no sessions, no social accounts, no Caterly roles or super-admin flag.
//   - The report holds counts and ids only: no email address, no password, no hash.
// A dry run (the default) does all the work in a transaction and rolls it back.

const cleanEmail = (e) => (typeof e === "string" ? e.trim().toLowerCase() : "");

export async function importCaterlyUsers({ source, target, apply = false }) {
  const users = (await source.query(`select id, name, email, "emailVerified", image, "createdAt", "updatedAt" from "user" order by id`)).rows;
  const accounts = (await source.query(`select id, "accountId", "userId", password, "createdAt", "updatedAt" from account where "providerId" = 'credential' and password is not null order by id`)).rows;
  const accountByUser = new Map(accounts.map((a) => [a.userId, a]));

  const report = {
    sourceUsers: users.length,
    sourceCredentialAccounts: accounts.length,
    usersAdded: 0,
    usersAlreadyPresent: 0,
    emailConflicts: 0,
    skippedNoEmail: 0,
    credentialAccountsAdded: 0,
    addedUnverified: 0,
    addedWithoutPassword: 0,
    addedUserIds: [],
    conflictUserIds: [],
    applied: false,
  };

  const client = await target.connect();
  try {
    await client.query("begin");
    const existing = (await client.query(`select id, lower(email) as email from "user"`)).rows;
    const byId = new Set(existing.map((r) => r.id));
    const byEmail = new Map(existing.map((r) => [r.email, r.id]));

    for (const u of users) {
      const email = cleanEmail(u.email);
      if (!email) {
        report.skippedNoEmail++;
        continue;
      }
      if (byId.has(u.id)) {
        report.usersAlreadyPresent++;
      } else if (byEmail.has(email)) {
        report.emailConflicts++;
        report.conflictUserIds.push(u.id);
        continue;
      } else {
        await client.query(
          `insert into "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $6, $7)`,
          [u.id, u.name || email, email, u.emailVerified === true, u.image ?? null, u.createdAt, u.updatedAt],
        );
        byId.add(u.id);
        byEmail.set(email, u.id);
        report.usersAdded++;
        report.addedUserIds.push(u.id);
        if (u.emailVerified !== true) report.addedUnverified++;
        if (!accountByUser.has(u.id)) report.addedWithoutPassword++;
      }
      const a = accountByUser.get(u.id);
      if (a) {
        // Only when this person has no password account yet: an existing one (possibly changed since) is never replaced.
        const res = await client.query(
          `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
           select $1, $2, 'credential', $3, $4, $5, $6
           where not exists (select 1 from account where "userId" = $3 and "providerId" = 'credential')
           on conflict (id) do nothing`,
          [a.id, a.accountId, u.id, a.password, a.createdAt, a.updatedAt],
        );
        report.credentialAccountsAdded += res.rowCount ?? 0;
      }
    }
    if (apply) {
      await client.query("commit");
      report.applied = true;
    } else {
      await client.query("rollback");
    }
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return report;
}
