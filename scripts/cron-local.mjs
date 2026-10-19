// Local stand-in for the server cron (deploy/cron/platterly.cron): calls the catering daily job every minute, so Platterly Ops stays
// current while testing and failed Ops events get retried. Needs `npm run dev` running. Stop with Ctrl+C.
//   npm run cron:local            (add `--ops` to also call Ops's own job; Ops dev server on port 3200)
import { readFileSync } from "node:fs";

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env: CRON_SECRET must already be in the environment */
}
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is not set (.env).");
  process.exit(1);
}
const targets = [{ name: "catering", url: "http://catering.localhost:3000/api/cron/daily" }];
if (process.argv.includes("--ops")) {
  let opsSecret = secret;
  try {
    const line = readFileSync("apps/ops/.env", "utf8").split("\n").find((l) => l.startsWith("CRON_SECRET="));
    if (line) opsSecret = line.slice("CRON_SECRET=".length).replace(/^"|"$/g, "");
  } catch {
    /* use the catering secret */
  }
  targets.push({ name: "ops", url: "http://ops.localhost:3200/api/cron", secret: opsSecret });
}

async function tick() {
  for (const t of targets) {
    try {
      const res = await fetch(t.url, { headers: { Authorization: `Bearer ${t.secret ?? secret}` }, signal: AbortSignal.timeout(50_000) });
      console.log(`${new Date().toLocaleTimeString()} ${t.name} ${res.status}`);
    } catch (error) {
      console.log(`${new Date().toLocaleTimeString()} ${t.name} failed: ${error.message}`);
    }
  }
}
await tick();
setInterval(tick, 60_000);
