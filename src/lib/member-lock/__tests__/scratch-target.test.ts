import { describe, it, expect } from "vitest";
import { APPROVED_URLS, assertApprovedTarget, checkServerFacts, type ServerFacts } from "./scratch-target";

// No database is used here. These prove the scratch-database target guard refuses everything except the two approved URLs.
const OK = APPROVED_URLS[0];
const noEnv = {};

describe("scratch target guard: connection string", () => {
  it.each(APPROVED_URLS)("accepts the approved URL %s", (url) => {
    expect(() => assertApprovedTarget(url, noEnv)).not.toThrow();
  });

  it.each([
    // wrong database / host / port / user
    ["dev database", "postgresql://platterly_app@localhost:5432/platterly_dev"],
    ["ops database", "postgresql://platterly_app@localhost:5432/platterly_ops"],
    ["audit copy", "postgresql://platterly_app@localhost:5432/platterly_dev_audit_f823a"],
    ["other *_test database", "postgresql://platterly_app@localhost:5432/some_other_test"],
    ["remote host", "postgresql://platterly_app@db.example.com:5432/platterly_member_lock_test"],
    ["other port", "postgresql://platterly_app@localhost:5433/platterly_member_lock_test"],
    ["no port", "postgresql://platterly_app@localhost/platterly_member_lock_test"],
    ["other user", "postgresql://aj@localhost:5432/platterly_member_lock_test"],
    ["no user", "postgresql://localhost:5432/platterly_member_lock_test"],
    ["password added", "postgresql://platterly_app:secret@localhost:5432/platterly_member_lock_test"],
    // query parameters that pg turns into config
    ["?host= override", `${OK}?host=db.example.com`],
    ["?host= unix socket", `${OK}?host=/tmp`],
    ["?hostaddr=", `${OK}?hostaddr=10.0.0.1`],
    ["?port= override", `${OK}?port=5433`],
    ["?dbname=", `${OK}?dbname=platterly_dev`],
    ["?database=", `${OK}?database=platterly_dev`],
    ["?user= override", `${OK}?user=aj`],
    ["?options= (session settings)", `${OK}?options=-c%20search_path%3Dpublic`],
    ["?service=", `${OK}?service=other`],
    ["?sslmode=", `${OK}?sslmode=disable`],
    ["?application_name=", `${OK}?application_name=x`],
    ["empty ? query", `${OK}?`],
    ["# fragment", `${OK}#x`],
    // other redirection attempts
    ["trailing slash", `${OK}/`],
    ["trailing space", `${OK} `],
    ["leading space", ` ${OK}`],
    ["upper-case host", "postgresql://platterly_app@LOCALHOST:5432/platterly_member_lock_test"],
    ["percent-encoded database", "postgresql://platterly_app@localhost:5432/platterly_member_lock_%74est"],
    ["userinfo host trick", "postgresql://localhost:5432@evil.example.com:5432/platterly_member_lock_test"],
    ["multiple hosts", "postgresql://platterly_app@localhost:5432,db.example.com:5432/platterly_member_lock_test"],
    ["postgres:// scheme", "postgres://platterly_app@localhost:5432/platterly_member_lock_test"],
    ["socket: scheme", "socket:/tmp?db=platterly_dev"],
    ["bare unix socket path", "/tmp platterly_dev"],
    ["empty string", ""],
  ])("refuses %s", (_label, url) => {
    expect(() => assertApprovedTarget(url, noEnv)).toThrow(/refuse/);
  });

  it.each(["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGOPTIONS", "PGSERVICE", "PGPASSWORD"])("refuses to run with %s set", (name) => {
    expect(() => assertApprovedTarget(OK, { [name]: "x" })).toThrow(/libpq environment variables/);
  });

  it("ignores unrelated environment variables", () => {
    expect(() => assertApprovedTarget(OK, { PATH: "/usr/bin", DATABASE_URL: "postgresql://x@y/z" })).not.toThrow();
  });
});

describe("scratch target guard: live server facts", () => {
  const good: ServerFacts = {
    current_database: "platterly_member_lock_test",
    current_user: "platterly_app",
    session_user: "platterly_app",
    server_addr: "127.0.0.1",
    server_port: 5432,
    port_setting: "5432",
    server_version: "16.15 (Homebrew)",
    database_owner: "platterly_app",
  };

  it("accepts the expected server", () => {
    expect(() => checkServerFacts(good)).not.toThrow();
    expect(() => checkServerFacts({ ...good, server_addr: "::1" })).not.toThrow();
  });

  it.each<[string, Partial<ServerFacts>]>([
    ["wrong database", { current_database: "platterly_dev" }],
    ["wrong current user", { current_user: "aj" }],
    ["wrong session user", { session_user: "aj" }],
    ["wrong owner", { database_owner: "aj" }],
    ["unix socket (no address)", { server_addr: null }],
    ["non-loopback address", { server_addr: "10.0.0.5" }],
    ["wrong port", { server_port: 5433 }],
    ["wrong port setting", { port_setting: "5433" }],
    ["other major version", { server_version: "17.1" }],
  ])("refuses %s", (_label, change) => {
    expect(() => checkServerFacts({ ...good, ...change })).toThrow(/refuse/);
  });
});
