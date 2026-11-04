// Checks every local app answers. Exit code 1 if any is down. `node scripts/local/smoke.mjs`
import { fileURLToPath } from "node:url";
import { APPS, MAIL_SINK } from "./apps.mjs";

export async function smoke(targets = [...APPS, MAIL_SINK], fetchImpl = fetch) {
  return Promise.all(
    targets.map(async (t) => {
      try {
        const res = await fetchImpl(t.health, { signal: AbortSignal.timeout(5000) });
        return { name: t.name, port: t.port, ok: res.ok, status: res.status };
      } catch (error) {
        return { name: t.name, port: t.port, ok: false, status: error instanceof Error ? error.message : "down" };
      }
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = await smoke();
  for (const r of results) console.log(`${r.ok ? "UP  " : "DOWN"} ${r.name.padEnd(10)} :${r.port}  ${r.status}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
