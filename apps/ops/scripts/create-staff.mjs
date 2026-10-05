// Creates (or resets the password of) an ops staff account. There is no sign-up page.
//   npm run ops:create-staff -- "Full Name" name@platterly.in
// The password is read from OPS_STAFF_PASSWORD or prompted on stdin; it is never printed or logged.
import "dotenv/config";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const [, , name, email] = process.argv;
if (!name || !email || !email.includes("@")) {
  console.error('Usage: npm run ops:create-staff -- "Full Name" name@example.com   (password via OPS_STAFF_PASSWORD or prompt)');
  process.exit(1);
}

async function readPassword() {
  if (process.env.OPS_STAFF_PASSWORD) return process.env.OPS_STAFF_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question("Password (min 12 characters): ", resolve));
  rl.close();
  return String(answer);
}

const password = await readPassword();
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const hash = await hashPassword(password);
const id = (prefix) => `${prefix}_${randomBytes(12).toString("hex")}`;
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const existing = await client.query('SELECT id FROM "user" WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows[0]) {
    await client.query('UPDATE "account" SET password = $1, "updatedAt" = now() WHERE "userId" = $2 AND "providerId" = $3', [hash, existing.rows[0].id, "credential"]);
    await client.query('DELETE FROM "session" WHERE "userId" = $1', [existing.rows[0].id]);
    console.log(`Updated the password for ${email} and signed them out.`);
  } else {
    const userId = id("usr");
    await client.query('INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $2, $3, true, now(), now())', [userId, name, email.toLowerCase()]);
    await client.query('INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, now(), now())', [id("acc"), userId, "credential", userId, hash]);
    console.log(`Created ops staff ${email}.`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
