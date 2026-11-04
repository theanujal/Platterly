// Prisma config for the isolated Stage 2 test database only. It reads no .env file and no URL from the environment: the only variable it
// accepts is the path of the protected credentials directory, and it builds the connection string from the 0600 files in there.
// Used with `prisma <command> --config prisma.test.config.mjs` from an empty working directory (see src/lib/migration-roundtrip/__tests__/db-target.ts).
import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 55433;
const DATABASE = "platterly_platform_test";
const ROLE = "platterly_platform_test_app";

const dir = join(homedir(), ".platterly", "stage2");
if (process.env.PLATFORM_TEST_CREDENTIALS_DIR !== dir) {
  throw new Error("PLATFORM_TEST_CREDENTIALS_DIR must be the approved Stage 2 directory");
}
const dirStat = lstatSync(dir);
if (dirStat.isSymbolicLink() || !dirStat.isDirectory() || (dirStat.mode & 0o777) !== 0o700) {
  throw new Error("the Stage 2 credentials directory must be a real directory with mode 700");
}
const target = JSON.parse(readFileSync(join(dir, "target.json"), "utf8"));
if (target.port !== PORT || target.database !== DATABASE || target.role !== ROLE) {
  throw new Error("target.json does not match the approved Stage 2 target");
}
const password = readFileSync(join(dir, "testrole.pw"), "utf8").trim();

const here = dirname(fileURLToPath(import.meta.url));

const config = {
  schema: resolve(here, "prisma", "schema.prisma"),
  migrations: { path: resolve(here, "prisma", "migrations") },
  datasource: { url: `postgresql://${ROLE}:${encodeURIComponent(password)}@${HOST}:${PORT}/${DATABASE}` },
};

export default config;
