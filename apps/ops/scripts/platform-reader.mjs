// Provisions and rotates the "platform-reader" secret the Platform signs its product-list requests with (F6.1.0).
//   npm --prefix apps/ops run platform-reader -- status
//   npm --prefix apps/ops run platform-reader -- provision [--out <file>]
//   npm --prefix apps/ops run platform-reader -- rotate    [--out <file>]
//   npm --prefix apps/ops run platform-reader -- finish --confirm-consumer-verified
// The secret is written to ONE file (mode 0600, default ~/.platterly/platform-reader.secret) and is never printed, logged,
// stored in plaintext or passed on the command line. Guide: docs/platform-reader-secret.md.
import "dotenv/config";
import pg from "pg";
import { ReaderError, defaultSecretPath, fileDeliverer, finish, provision, rotate, status } from "./lib/platform-reader.mjs";

const [, , command, ...rest] = process.argv;
const usage = "Usage: platform-reader <status | provision [--out <file>] | rotate [--out <file>] | finish --confirm-consumer-verified>";

function option(name) {
  const at = rest.indexOf(name);
  return at === -1 ? null : (rest[at + 1] ?? "");
}

if (!["status", "provision", "rotate", "finish"].includes(command ?? "")) {
  console.error(usage);
  process.exit(1);
}
const known = new Set(["--out", "--confirm-consumer-verified"]);
const unknown = rest.filter((a, i) => a.startsWith("--") && !known.has(a) && rest[i - 1] !== "--out");
if (unknown.length) {
  console.error(`Unknown option ${unknown[0]}. ${usage}`);
  process.exit(1);
}
if (!process.env.OPS_SECRETS_KEY && command !== "status") console.error("Note: OPS_SECRETS_KEY is not set; BETTER_AUTH_SECRET is used as the encryption key (development only). Production must set OPS_SECRETS_KEY.");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (command === "status") {
    const s = await status(pool);
    if (!s.provisioned) console.log("Not provisioned: no platform-reader secret exists. Run `provision`.");
    else console.log(`Provisioned (created ${s.createdAt.toISOString()}). Rotation ${s.rotationPending ? "PENDING: the previous secret is still valid; run `finish` once the consumer uses the new one" : "not pending"}.${s.rotatedAt ? ` Last rotated ${s.rotatedAt.toISOString()}.` : ""} listVersion ${s.listVersion}.`);
  } else if (command === "finish") {
    if (!rest.includes("--confirm-consumer-verified")) {
      console.error("Refusing: `finish` makes the previous secret stop working. Install the new secret at the consumer, verify it works, then run again with --confirm-consumer-verified.");
      process.exit(1);
    }
    await finish(pool);
    console.log("Rotation finished: the previous secret no longer works.");
  } else {
    const out = option("--out");
    if (out === "") throw new ReaderError("--out needs a file path.");
    const path = out ?? defaultSecretPath(command);
    const run = command === "provision" ? provision : rotate;
    await run(pool, fileDeliverer(path), { output: path });
    console.log(`${command === "provision" ? "Provisioned" : "Rotated"}. The secret was written to ${path} (mode 600) and is not shown anywhere else.`);
    if (command === "rotate") console.log("The previous secret is still valid. Install the new one at the consumer, verify it, then run `finish --confirm-consumer-verified`.");
    else console.log("Move it into the consumer's secret store, then delete the file.");
  }
} catch (error) {
  if (error instanceof ReaderError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    // Never print the error object: it is not known to be free of connection details.
    console.error(`Failed: ${error?.code ?? error?.name ?? "unexpected error"}`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
