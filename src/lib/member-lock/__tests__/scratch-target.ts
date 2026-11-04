import { parse } from "pg-connection-string";

// Target guard for the F8.2.4a concurrency tests. Shared by with-member-lock.test.ts and scratch-target.test.ts.
//
// `pg` turns every query parameter in a connection string into connection config (host, port, user, database, options,
// service-style overrides), and also accepts a bare "/path" unix-socket form and a "socket:" scheme. A check that parses the
// URL and compares the database name therefore cannot be trusted on its own. So the URL must be one of two EXACT approved
// strings; anything else, including any extra character, is refused. The parsed config and the environment are checked as well,
// and verifyServerIdentity() checks the live connection after it is made.

export const APPROVED_DB = "platterly_member_lock_test";
export const APPROVED_USER = "platterly_app";
export const APPROVED_PORT = "5432";
export const APPROVED_URLS: readonly string[] = [
  `postgresql://${APPROVED_USER}@localhost:${APPROVED_PORT}/${APPROVED_DB}`,
  `postgresql://${APPROVED_USER}@127.0.0.1:${APPROVED_PORT}/${APPROVED_DB}`,
];

export function assertApprovedTarget(url: string, env: Record<string, string | undefined> = process.env): void {
  if (!APPROVED_URLS.includes(url)) {
    throw new Error(`member-lock tests refuse this connection string: it is not one of the approved scratch URLs for "${APPROVED_DB}"`);
  }
  // Belt and braces: what pg will actually use, parsed the way pg parses it.
  const cfg = parse(url) as Record<string, unknown>;
  const expectedHost = new URL(url).hostname;
  const keys = Object.keys(cfg).filter((k) => cfg[k] !== null && cfg[k] !== undefined && cfg[k] !== "");
  const unexpected = keys.filter((k) => !["host", "port", "database", "user"].includes(k));
  if (unexpected.length || cfg.host !== expectedHost || String(cfg.port) !== APPROVED_PORT || cfg.database !== APPROVED_DB || cfg.user !== APPROVED_USER) {
    throw new Error("member-lock tests refuse this connection string: pg would not connect exactly to the approved target");
  }
  // libpq-style variables (PGHOST, PGOPTIONS, PGSERVICE, ...) are read by pg for anything the URL leaves unset.
  const pgVars = Object.keys(env).filter((k) => k.startsWith("PG") && env[k] !== undefined);
  if (pgVars.length) throw new Error(`member-lock tests refuse to run with libpq environment variables set: ${pgVars.join(", ")}`);
}

export type ServerFacts = {
  current_database: string;
  current_user: string;
  session_user: string;
  server_addr: string | null;
  server_port: number | null;
  port_setting: string;
  server_version: string;
  database_owner: string;
};

/** The query that produces ServerFacts; run it on the connected observer client. */
export const SERVER_FACTS_SQL = `SELECT current_database() AS current_database, current_user AS current_user, session_user AS session_user,
  host(inet_server_addr()) AS server_addr, inet_server_port() AS server_port, current_setting('port') AS port_setting,
  current_setting('server_version') AS server_version,
  (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) AS database_owner`;

/**
 * Checks the live connection. PostgreSQL gives a non-superuser no instance id (data_directory and the control-file system
 * identifier need privileges the app role does not have), so the identity is: the right database, role and owner, a loopback
 * server address, the approved port, and the Homebrew PostgreSQL 16 line recorded in the setup report.
 */
export function checkServerFacts(f: ServerFacts): void {
  const problems: string[] = [];
  if (f.current_database !== APPROVED_DB) problems.push(`current_database() is "${f.current_database}"`);
  if (f.current_user !== APPROVED_USER || f.session_user !== APPROVED_USER) problems.push(`role is "${f.current_user}"/"${f.session_user}"`);
  if (f.database_owner !== APPROVED_USER) problems.push(`database owner is "${f.database_owner}"`);
  if (f.server_addr !== "127.0.0.1" && f.server_addr !== "::1") problems.push(`server address is "${f.server_addr}", expected loopback over TCP`);
  if (String(f.server_port) !== APPROVED_PORT || f.port_setting !== APPROVED_PORT) problems.push(`server port is ${f.server_port}/${f.port_setting}`);
  if (!f.server_version.startsWith("16.")) problems.push(`server_version is "${f.server_version}", expected 16.x`);
  if (problems.length) throw new Error(`member-lock tests refuse this server: ${problems.join("; ")}`);
}
