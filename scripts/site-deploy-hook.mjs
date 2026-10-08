// Runs on the web server (Hostinger VPS) next to Nginx. Platterly Ops' Publish button calls it; it rebuilds the marketing site
// from the latest code plus the text saved in Ops, switches Nginx's document root to the new build, and reports back to Ops.
//
//   SITE_SECRET=... OPS_CONTENT_URL=https://ops.platterly.in/api/site/content \
//   OPS_RESULT_URL=https://ops.platterly.in/api/site/publish-result \
//   SITE_REPO_DIR=/srv/platterly/repo SITE_WEB_ROOT=/var/www/platterly-site \
//   node scripts/site-deploy-hook.mjs
//
// Nginx serves SITE_WEB_ROOT/current (a symlink). Each build lands in SITE_WEB_ROOT/releases/<timestamp> and the symlink moves
// in one step, so visitors never see a half-written site and the previous releases stay for a quick rollback. Listens on
// 127.0.0.1 only: put an Nginx location with TLS in front of it (docs/site-publish.md).
import { createHmac, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const env = process.env;
const secret = env.SITE_SECRET ?? "";
const port = Number(env.SITE_HOOK_PORT ?? 3300);
const repo = env.SITE_REPO_DIR ?? process.cwd();
const webRoot = env.SITE_WEB_ROOT ?? "";
const dry = env.DEPLOY_DRY_RUN === "1"; // builds for real but skips git pull, npm ci and the switch (for testing)
const TOLERANCE_SECONDS = 300;
const KEEP_RELEASES = 5;

if (!secret || !env.OPS_CONTENT_URL || !env.OPS_RESULT_URL || (!webRoot && !dry)) {
  console.error("Set SITE_SECRET, OPS_CONTENT_URL, OPS_RESULT_URL and SITE_WEB_ROOT.");
  process.exit(1);
}

const sign = (timestamp, body) => `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

/** Same check as Ops' verifyRequest: HMAC-SHA256 over "<timestamp>.<raw body>", constant-time, within five minutes. */
function isSigned(headers, body, now = Math.floor(Date.now() / 1000)) {
  const timestamp = headers["x-platterly-timestamp"];
  const signature = headers["x-platterly-signature"];
  if (typeof timestamp !== "string" || typeof signature !== "string" || !/^\d{9,12}$/.test(timestamp)) return false;
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(sign(timestamp, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function run(command, args, cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...env, ...extraEnv }, stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} failed (${code})`))));
  });
}

async function report(publishId, ok, message) {
  const body = JSON.stringify({ publishId, ok, message });
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const response = await fetch(env.OPS_RESULT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-platterly-timestamp": String(timestamp), "x-platterly-signature": sign(timestamp, body), "x-platterly-event-id": publishId, "x-platterly-contract": "1" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) console.error(`[deploy] Ops answered ${response.status} to the result.`);
  } catch (error) {
    console.error("[deploy] could not report to Ops:", error instanceof Error ? error.message : error);
  }
}

let running = false;

async function deploy(publishId) {
  const site = join(repo, "apps", "site");
  try {
    if (!dry) {
      await run("git", ["pull", "--ff-only"], repo);
      await run("npm", ["ci"], site);
    }
    // The build fetches the text from Ops first (a refused or failed fetch stops it), then writes apps/site/out.
    await run("npm", ["run", "build"], site, { OPS_CONTENT_URL: env.OPS_CONTENT_URL, SITE_SECRET: secret });
    if (dry) return await report(publishId, true, "Dry run: built, not switched.");
    const releases = join(webRoot, "releases");
    const release = join(releases, new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14));
    mkdirSync(releases, { recursive: true });
    cpSync(join(site, "out"), release, { recursive: true });
    const link = join(webRoot, "current");
    const next = join(webRoot, ".current.new");
    rmSync(next, { force: true });
    symlinkSync(release, next);
    renameSync(next, link); // atomic: the symlink points at the new build or the old one, never at nothing
    for (const old of readdirSync(releases).sort().slice(0, -KEEP_RELEASES)) rmSync(join(releases, old), { recursive: true, force: true });
    await report(publishId, true, "Published.");
  } catch (error) {
    await report(publishId, false, error instanceof Error ? error.message : "The build failed.");
  } finally {
    running = false;
  }
}

createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; if (body.length > 10_000) req.destroy(); });
  req.on("end", () => {
    if (req.method !== "POST" || !isSigned(req.headers, body)) { res.writeHead(401).end(); return; }
    let publishId;
    try { publishId = JSON.parse(body).publishId; } catch { /* handled below */ }
    if (typeof publishId !== "string" || !publishId) { res.writeHead(400).end(); return; }
    if (running) { res.writeHead(409).end(); return; }
    running = true;
    res.writeHead(202).end(); // answer first: the build takes a minute or two and Ops would time out waiting
    void deploy(publishId);
  });
}).listen(port, "127.0.0.1", () => console.log(`[deploy] listening on 127.0.0.1:${port}${dry ? " (dry run)" : ""}`));
