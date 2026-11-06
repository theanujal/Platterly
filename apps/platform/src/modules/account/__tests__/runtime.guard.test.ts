import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getSession } from "@/lib/session";
import { GET } from "../../../app/api/account/overview/route";

// Static and runtime guards: the running application has no mock identity and no way to be given one.
const SRC = path.resolve(__dirname, "../../..");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "generated" && e.name !== "node_modules") walk(full, out);
    } else if (/\.(ts|tsx|css)$/.test(e.name)) out.push(full);
  }
  return out;
};
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const runtimeFiles = walk(SRC).filter((f) => !rel(f).includes("__tests__/") && !/\.test\.tsx?$/.test(f));
// The Account surface (the Store prototype has its own sample catalogue and is not part of this task).
const accountFiles = runtimeFiles.filter((f) => /^(components\/account|lib\/account|modules\/account|lib\/session|app\/api\/account|app\/(business|products|profile|security)\/|app\/page\.tsx)/.test(rel(f)));

describe("no mock identity at runtime", () => {
  it("the session interface returns nobody unless the request carries a valid signed Account cookie (here: no cookie, no secret, no request)", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("IDENTITY_DATABASE_URL", "");
    expect(await getSession()).toBeNull();
    vi.stubEnv("AUTH_SECRET", "k".repeat(48));
    vi.stubEnv("IDENTITY_DATABASE_URL", "postgresql://nobody@127.0.0.1:1/none");
    expect(await getSession(), "outside a request there is no cookie to read").toBeNull();
    vi.unstubAllEnvs();
  });

  it("the session module takes identity only from the signed Account cookie: no other header, query string, fixture or default user", () => {
    const text = readFileSync(path.join(SRC, "lib/session/index.ts"), "utf8").replace(/\/\/.*$/gm, "");
    expect(text).not.toMatch(/headers\(|searchParams|__tests__|fixture|x-user|authorization/i);
    const envReads = [...text.matchAll(/process\.env\.(\w+)/g)].map((m) => m[1]).sort();
    expect([...new Set(envReads)]).toEqual(["AUTH_SECRET", "IDENTITY_DATABASE_URL"]);
    expect(text).toContain("COOKIES.accountSession");
  });

  it("no runtime file imports a test fixture or a __tests__ folder", () => {
    const offenders = runtimeFiles.filter((f) => /from\s+["'][^"']*(__tests__|session-fixture)/.test(readFileSync(f, "utf8"))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("the old prototype's invented person, business and devices are gone from the running code", () => {
    const BAD = /MOCK_USER|mock-data|SAMPLE_DEVICES|Meera|Kapoor|Spice Route|example\.com|98200|INITIAL_CATERLY|sample data|invented/i;
    const offenders = accountFiles.filter((f) => BAD.test(readFileSync(f, "utf8"))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("the overview route answers 401 without a session, and 404 off the account host", async () => {
    const onAccount = await GET(new Request("http://account.localhost:3300/api/account/overview", { headers: { host: "account.localhost:3300" } }));
    expect(onAccount.status).toBe(401);
    expect(await onAccount.json()).toEqual({ status: "unauthenticated" });
    for (const host of ["store.localhost:3300", "auth.localhost:3300", "localhost:3300", "account.localhost.evil.test"]) {
      expect((await GET(new Request("http://x/api/account/overview", { headers: { host } }))).status, host).toBe(404);
    }
  });
});
