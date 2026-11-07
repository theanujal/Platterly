// Dev check for one imported Caterly user (F4.1.3). Asks for the password with hidden input, so it never lands in a log or chat.
//   source ~/.platterly/f4dev/env.sh && node scripts/check-imported-login.mjs kitchen@platterly.local
// 1) checks the password against the stored hash, 2) then, against the running dev server (3300) and the mail sink (3600), signs in; an unverified
// person is sent a code, which is read from the sink and entered, exactly as the sign-in page does. Local F4 cluster only.
import pg from "pg";
import { verifyPassword } from "better-auth/crypto";

const email = (process.argv[2] ?? "").toLowerCase();
if (!email) throw new Error("usage: node scripts/check-imported-login.mjs <email>");
const url = process.env.IDENTITY_DATABASE_URL;
if (!url || ["5432", "55432", "55433"].includes(new URL(url).port)) throw new Error("run after `source ~/.platterly/f4dev/env.sh` (F4 cluster only)");

const password = await new Promise((resolve) => {
  process.stdout.write(`Password for ${email} (hidden): `);
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";
  stdin.on("data", (ch) => {
    for (const c of ch) {
      if (c === "\r" || c === "\n") {
        stdin.setRawMode?.(false);
        stdin.pause();
        process.stdout.write("\n");
        return resolve(value);
      }
      if (c === "\u0003") process.exit(130);
      value = c === "\u007f" ? value.slice(0, -1) : value + c;
    }
  });
});

const pool = new pg.Pool({ connectionString: url, max: 1 });
const row = (await pool.query(`select u.id, u."emailVerified", a.password from "user" u left join account a on a."userId" = u.id and a."providerId" = 'credential' where u.email = $1`, [email])).rows[0];
await pool.end();
if (!row) throw new Error("no such user in the identity database");
console.log(`user found; email verified: ${row.emailVerified}; has password: ${Boolean(row.password)}`);
if (!row.password) process.exit(1);
const matches = await verifyPassword({ hash: row.password, password });
console.log(`1) stored hash vs your password: ${matches ? "MATCH" : "NO MATCH"}`);
if (!matches) process.exit(1);

const AUTH = "http://auth.localhost:3300";
const post = (path, body) => fetch(`${AUTH}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: AUTH }, body: JSON.stringify(body) });
let res = await post("/api/auth/sign-in/email", { email, password });
console.log(`2) sign-in on the running server: HTTP ${res.status}`);
if (res.status === 403) {
  console.log("   not verified yet: asking for a code (as the sign-in page does), then reading it from the local mail sink");
  await post("/api/auth/email-otp/send-verification-otp", { email, type: "email-verification" });
  let code;
  for (let i = 0; i < 40 && !code; i++) {
    const msgs = await (await fetch("http://localhost:3600/api/messages")).json();
    const mine = msgs.filter((m) => m.to.includes(email)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    code = mine?.subject.match(/\b(\d{6})\b/)?.[1];
    if (!code) await new Promise((r) => setTimeout(r, 250));
  }
  if (!code) throw new Error("no code reached the sink");
  const v = await post("/api/auth/email-otp/verify-email", { email, otp: code });
  console.log(`   verify with the emailed code: HTTP ${v.status}`);
  res = await post("/api/auth/sign-in/email", { email, password });
  console.log(`3) sign-in after verifying: HTTP ${res.status}`);
}
console.log(res.status === 200 ? "RESULT: the imported user signs in with the Caterly password." : "RESULT: sign-in did not succeed.");
