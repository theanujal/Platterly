import { Pool } from "pg";

declare global {
  var __stubPool: Pool | undefined;
}

/** The stub's own database (never Platform's). */
export function pool(): Pool {
  const url = process.env.STUB_DATABASE_URL;
  if (!url) throw new Error("STUB_DATABASE_URL is not set");
  if (!globalThis.__stubPool) globalThis.__stubPool = new Pool({ connectionString: url, max: 5 });
  return globalThis.__stubPool;
}
