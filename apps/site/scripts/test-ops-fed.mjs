// Builds the site from e2e/fixtures/ops-bundle.json (a stand-in for the content Ops sends), runs the Ops-fed Playwright tests, then
// always removes the bundle and rebuilds from the repo's own files so out/ is never left holding fixture content.
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(site, "..", "..");
const bundle = join(site, "src", "content", ".ops", "bundle.json");
const run = (command, args, cwd) => spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, OPS_CONTENT_URL: "", SITE_SECRET: "" } }).status ?? 1;

if (existsSync(bundle)) {
  console.error("[ops-fed] src/content/.ops/bundle.json already exists (a real Ops fetch?). Delete it first; this script will not overwrite it.");
  process.exit(1);
}
let status = 1;
try {
  mkdirSync(dirname(bundle), { recursive: true });
  copyFileSync(join(site, "e2e", "fixtures", "ops-bundle.json"), bundle);
  status = run("npx", ["next", "build"], site) || run("npx", ["playwright", "test", "-c", "apps/site/e2e/playwright.ops-fed.config.ts"], repo);
} finally {
  rmSync(bundle, { force: true });
  const rebuilt = run("npm", ["run", "build"], site);
  if (rebuilt !== 0) console.error("[ops-fed] The rebuild from the repo's own files failed: run `npm run build` in apps/site.");
  status ||= rebuilt;
}
process.exit(status);
