// One command starts everything for local work: `npm run dev:all`.
// Starts the mail sink and each app that is not already listening on its port, points catering and Ops at the sink so no
// email leaves the machine, waits until they answer and prints the result. Ctrl-C stops only what this script started.
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APPS, MAIL_SINK } from "./apps.mjs";
import { startMailSink } from "./mail-sink.mjs";
import { smoke } from "./smoke.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const listening = (port) => new Promise((resolve) => {
  const s = createConnection({ port, host: "127.0.0.1" }, () => (s.destroy(), resolve(true)));
  s.on("error", () => resolve(false));
});

const started = [];
let sink = null;
if (await listening(MAIL_SINK.port)) console.log(`[dev-all] mail-sink already on :${MAIL_SINK.port}`);
else (sink = await startMailSink(MAIL_SINK.port)), console.log(`[dev-all] mail-sink on :${MAIL_SINK.port}`);

// Local mail goes to the sink, whatever the .env files say. A real token in .env cannot send anything from here.
const env = { ...process.env, ZEPTOMAIL_API_URL: `http://localhost:${MAIL_SINK.port}/v1.1/email`, ZEPTOMAIL_TOKEN: "local-sink", ZEPTOMAIL_FROM: "noreply@platterly.localhost" };

for (const app of APPS) {
  if (await listening(app.port)) {
    console.log(`[dev-all] ${app.name} already on :${app.port}`);
    continue;
  }
  const child = spawn(app.dev[0], app.dev.slice(1), { cwd: join(root, app.cwd), env, stdio: ["ignore", "pipe", "pipe"] });
  const tag = `[${app.name}] `;
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (d) => process.stdout.write(String(d).split("\n").filter(Boolean).map((l) => tag + l).join("\n") + "\n"));
  child.on("exit", (code) => console.log(`[dev-all] ${app.name} exited (${code})`));
  started.push(child);
  console.log(`[dev-all] starting ${app.name} on :${app.port}`);
}

function stop() {
  for (const c of started) c.kill("SIGTERM");
  sink?.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const results = await smoke();
  if (results.every((r) => r.ok)) {
    console.log("\n[dev-all] all up:");
    for (const r of results) console.log(`  ${r.name.padEnd(10)} http://localhost:${r.port}`);
    console.log("  platform hosts: http://auth.localhost:3300  http://account.localhost:3300  http://store.localhost:3300");
    console.log(`  mail sink:      http://localhost:${MAIL_SINK.port}/`);
    break;
  }
  if (i === 59) console.log("[dev-all] not everything answered in 2 minutes:", results.filter((r) => !r.ok).map((r) => r.name).join(", "));
}
if (!started.length && !sink) process.exit(0);
