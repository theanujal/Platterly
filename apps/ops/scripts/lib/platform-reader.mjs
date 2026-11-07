// The "platform-reader" secret: provisioning, rotation and the files the secret is delivered in (F6.1.0).
// docs/platform-foundation-plan.md section 5a; operator guide: docs/platform-reader-secret.md.
//
// Rules this file enforces:
//  - The plaintext secret exists only in memory and in ONE file created for it (mode 0600, in a 0700 directory, never overwriting).
//    It is never printed, logged, put in an audit row, passed as an argument or returned to a caller.
//  - The database holds only the AES-256-GCM ciphertext (same format as src/lib/secret-box.ts).
//  - Provisioning and rotation are concurrency-safe: a unique key for the first, a compare-and-swap for the second.
//  - A second rotation is refused until the first has been finished explicitly. Both secrets stay valid in between.
//  - Every step is audited in the same transaction as the change; if the audit cannot be written, the change is not made.
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { constants as fsc } from "node:fs";
import { lstat, mkdir, open, chmod, unlink } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROW = "default";

export class ReaderError extends Error {}

/** A fresh signing secret. Same shape as `newSigningSecret` in src/lib/secret-box.ts. */
export function newSigningSecret() {
  return `opssec_${randomBytes(32).toString("base64url")}`;
}

/** `v1.<iv>.<tag>.<ciphertext>`, key from OPS_SECRETS_KEY (development falls back to BETTER_AUTH_SECRET), as in src/lib/secret-box.ts. */
export function encryptSecret(plain, env = process.env) {
  const secret = env.OPS_SECRETS_KEY || env.BETTER_AUTH_SECRET;
  if (!secret) throw new ReaderError("OPS_SECRETS_KEY (or BETTER_AUTH_SECRET) must be set to store the secret.");
  const key = createHash("sha256").update(`platterly-ops:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function auditDetail(extra) {
  // Only these fields are ever written; the secret is not a parameter of this function.
  return JSON.stringify({ via: "cli", osUser: userInfo().username, ...extra });
}

async function writeAudit(client, action, extra) {
  await client.query(
    `INSERT INTO audit_log (id, "actorUserId", action, subject, detail) VALUES ($1, NULL, $2, $3, $4::jsonb)`,
    [`aud_${randomBytes(12).toString("hex")}`, action, ROW, auditDetail(extra)],
  );
}

async function inTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * `deliver(secret)` puts the plaintext where the operator will pick it up and returns an async `cleanup`. It runs BEFORE the database
 * change, so a committed secret can never be lost; if the change then fails, `cleanup` removes what `deliver` created.
 */
export async function provision(pool, deliver, { output = null } = {}) {
  const existing = await pool.query("SELECT 1 FROM platform_reader WHERE id = $1", [ROW]);
  if (existing.rowCount) throw new ReaderError("A platform-reader secret already exists. It is kept as it is. Use `rotate` to issue a new one (the existing one stays valid until `finish`).");
  const secret = newSigningSecret();
  const encrypted = encryptSecret(secret);
  const cleanup = await deliver(secret);
  try {
    await inTransaction(pool, async (client) => {
      await client.query(`INSERT INTO platform_reader (id, secret, "updatedAt") VALUES ($1, $2, now())`, [ROW, encrypted]);
      await writeAudit(client, "platform_reader.provisioned", { output });
    });
  } catch (error) {
    await cleanup();
    if (error?.code === "23505") throw new ReaderError("Another provisioning ran at the same moment and won. Nothing was changed by this one.");
    throw error;
  }
}

export async function rotate(pool, deliver, { output = null } = {}) {
  const { rows } = await pool.query(`SELECT secret, "secretPrevious" FROM platform_reader WHERE id = $1`, [ROW]);
  const row = rows[0];
  if (!row) throw new ReaderError("No platform-reader secret exists yet. Use `provision` first.");
  if (row.secretPrevious) throw new ReaderError("A rotation is still unfinished (the previous secret is still valid). Install and verify the new secret at its consumer, then run `finish`. Nothing was changed.");
  const secret = newSigningSecret();
  const encrypted = encryptSecret(secret);
  const cleanup = await deliver(secret);
  try {
    await inTransaction(pool, async (client) => {
      // Compare-and-swap: only if nobody rotated since we read the row.
      const done = await client.query(
        `UPDATE platform_reader SET secret = $1, "secretPrevious" = $2, "rotatedAt" = now(), "updatedAt" = now()
         WHERE id = $3 AND "secretPrevious" IS NULL AND secret = $2`,
        [encrypted, row.secret, ROW],
      );
      if (done.rowCount !== 1) throw new ReaderError("The secret was changed by another process at the same moment. Nothing was changed by this rotation.");
      await writeAudit(client, "platform_reader.rotated", { output });
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Ends a rotation: the previous secret stops working. Only after the consumer runs on the new one. */
export async function finish(pool) {
  await inTransaction(pool, async (client) => {
    const done = await client.query(`UPDATE platform_reader SET "secretPrevious" = NULL, "updatedAt" = now() WHERE id = $1 AND "secretPrevious" IS NOT NULL`, [ROW]);
    if (done.rowCount !== 1) throw new ReaderError("No rotation is pending, so there is nothing to finish.");
    await writeAudit(client, "platform_reader.rotation_finished", {});
  });
}

/** What exists, never the secret. */
export async function status(pool) {
  const { rows } = await pool.query(`SELECT "secretPrevious" IS NOT NULL AS pending, "rotatedAt", "createdAt", "listVersion" FROM platform_reader WHERE id = $1`, [ROW]);
  if (!rows[0]) return { provisioned: false };
  return { provisioned: true, rotationPending: rows[0].pending, rotatedAt: rows[0].rotatedAt, createdAt: rows[0].createdAt, listVersion: rows[0].listVersion };
}

// ---------- Secret files ----------

export function defaultSecretDir() {
  return join(homedir(), ".platterly");
}

export function defaultSecretPath(kind, now = new Date()) {
  const dir = defaultSecretDir();
  if (kind === "provision") return join(dir, "platform-reader.secret");
  // A rotation never reuses the first file's name, so nothing is ever overwritten.
  return join(dir, `platform-reader.secret.next-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`);
}

/** The directory must be ours and closed to everyone else. A missing default directory is created (0700); any other must already exist. */
async function ensureSecretDir(dir, { create }) {
  let info = await lstat(dir).catch((error) => (error?.code === "ENOENT" ? null : Promise.reject(error)));
  if (!info) {
    if (!create) throw new ReaderError(`The directory ${dir} does not exist. Create it (mode 700) or use the default location.`);
    // Another provisioning may create it at the same moment; that is fine, the checks below still apply to whatever is there.
    await mkdir(dir, { mode: 0o700 }).catch((error) => (error?.code === "EEXIST" ? undefined : Promise.reject(error)));
    info = await lstat(dir);
    if (info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) !== 0 && info.uid === process.getuid?.()) await chmod(dir, 0o700);
    info = await lstat(dir);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) throw new ReaderError(`${dir} is not a plain directory.`);
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) throw new ReaderError(`${dir} is not owned by you.`);
  if ((info.mode & 0o077) !== 0) throw new ReaderError(`${dir} is open to other users (mode ${(info.mode & 0o777).toString(8)}). Run: chmod 700 ${dir}`);
}

/**
 * Returns a `deliver` function for provision/rotate that writes the secret to `path` (exclusive create, mode 0600, never following a link
 * and never overwriting) and returns the cleanup that removes that same file again if the database change fails.
 */
export function fileDeliverer(path) {
  const target = resolve(path);
  return async (secret) => {
    await ensureSecretDir(dirname(target), { create: dirname(target) === defaultSecretDir() });
    let handle;
    try {
      handle = await open(target, fsc.O_WRONLY | fsc.O_CREAT | fsc.O_EXCL | fsc.O_NOFOLLOW, 0o600);
    } catch (error) {
      if (error?.code === "EEXIST" || error?.code === "ELOOP") throw new ReaderError(`${target} already exists. It is never overwritten. Choose another path with --out.`);
      throw error;
    }
    try {
      const info = await handle.stat();
      if ((info.mode & 0o077) !== 0) throw new ReaderError(`${target} was created open to other users; refusing to write the secret to it.`);
      await handle.writeFile(`${secret}\n`);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await unlink(target).catch(() => undefined);
      throw error;
    }
    await handle.close();
    return async () => {
      await unlink(target).catch(() => undefined);
    };
  };
}
