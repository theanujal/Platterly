// Seeds the local databases with what every app needs to be usable: the catering master food library and the dev plan.
// Safe to repeat. Platform has no tables yet; its seed step is added by the phase that creates them.
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const script of ["db:seed-catalog", "db:seed-dev-plan"]) {
  console.log(`[seed:local] npm run ${script}`);
  const run = spawnSync("npm", ["run", script], { cwd: root, stdio: "inherit" });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
console.log("[seed:local] platform: nothing to seed yet (no tables).");
