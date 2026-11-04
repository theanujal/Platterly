import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// F8.2.4a baseline guard. Static and read-only: it reads source files and compares against known-member-writes.json.
// It needs no database, so it runs in the default `npm run test`.
//
// WHAT IT COVERS: non-test source files under `src/` (.ts .tsx .mjs .js). It skips any `__tests__` directory, `generated`,
// `node_modules` and `*.test.ts(x)`. It looks for Prisma writes on a model called `member` (create, createMany, update,
// updateMany, delete, deleteMany, upsert; also across line breaks, with `?.`, and as `["member"]`) and for raw SQL
// INSERT INTO / UPDATE / DELETE FROM member or public.member. Comments are ignored; text inside strings is kept.
//
// WHAT IT DOES NOT COVER (this is NOT repository-wide Member-write coverage):
//   - `apps/`, `packages/`, `scripts/` and `e2e/` are not scanned.
//   - Better Auth's own writes to `member` (it writes through its Prisma adapter inside the library) are invisible here.
//   - Nested relation writes (for example `organization.update({ data: { members: { create } } })`), dynamically built SQL,
//     aliases of the Prisma client, and writes in code outside `src/`.
//   - It is a text scan, not a parser: regex literals or unusual quoting can confuse the comment stripper.
// It only says "no NEW direct Member write has appeared in src/ beyond the baseline". It does not require existing code to use
// withMemberLock; wrapping the existing writes is F8.2.4b.

const ROOT = path.resolve(__dirname, "../../../..");
const SRC = path.join(ROOT, "src");
const BASELINE_PATH = path.join(__dirname, "../known-member-writes.json");
const BASELINE_FILE = "src/lib/member-lock/known-member-writes.json";
const OPS = ["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"];
const OPS_RE = OPS.join("|");
const PRISMA_WRITE = new RegExp(`\\bmember\\s*\\??\\.\\s*(${OPS_RE})\\s*\\(|\\[\\s*["']member["']\\s*\\]\\s*\\??\\.\\s*(${OPS_RE})\\s*\\(`, "g");
const RAW_WRITE = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?public"?\s*\.\s*)?"?member"?(?![A-Za-z_0-9])/gi;

export const SCOPE_NOTE =
  "Guard scope: scans src/ only (not apps/, packages/, scripts/, e2e/) and cannot see Better Auth's own writes to member. " +
  "A pass is not proof that no other Member write exists.";

export type WriteCounts = Record<string, number>;

/** Removes // and block comments but keeps the text of string and template literals (raw SQL lives there). */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote || (quote !== "`" && c === "\n")) quote = null; // ' and " end at a newline, so a stray apostrophe in JSX text cannot swallow the file
      i++;
    } else if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      out += " ";
    } else {
      if (c === "'" || c === '"' || c === "`") quote = c;
      out += c;
      i++;
    }
  }
  return out;
}

/** Counts Prisma and raw-SQL writes to the member table in one file's text. */
export function countMemberWrites(source: string): WriteCounts {
  const code = stripComments(source);
  const counts: WriteCounts = {};
  for (const m of code.matchAll(PRISMA_WRITE)) {
    const op = m[1] ?? m[2];
    counts[op] = (counts[op] ?? 0) + 1;
  }
  const raw = [...code.matchAll(RAW_WRITE)].length;
  if (raw) counts.raw = raw;
  return counts;
}

function isTestOrGenerated(relFromSrc: string): boolean {
  return relFromSrc.split(path.sep).some((p) => p === "__tests__" || p === "generated" || p === "node_modules") || /\.test\.tsx?$/.test(relFromSrc);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

export type Baseline = Record<string, WriteCounts>;

/** Parses and validates the baseline text. Returns the baseline and a list of actionable problems. */
export function loadBaseline(text: string): { baseline: Baseline; problems: string[] } {
  const problems: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { baseline: {}, problems: [`${BASELINE_FILE} is not valid JSON (${(e as Error).message}). Fix the syntax; it must be an object of "src/path": { "operation": count }.`] };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { baseline: {}, problems: [`${BASELINE_FILE} must be a JSON object mapping "src/path" to { "operation": count }.`] };
  }
  const baseline: Baseline = {};
  for (const [file, value] of Object.entries(raw as Record<string, unknown>)) {
    if (file.startsWith("_")) continue; // _comment and similar notes
    if (!file.startsWith("src/")) {
      problems.push(`${BASELINE_FILE}: key "${file}" must be a path starting with "src/" (the guard scans src/ only).`);
      continue;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      problems.push(`${BASELINE_FILE}: "${file}" must be an object like { "update": 2 }.`);
      continue;
    }
    const counts: WriteCounts = {};
    for (const [op, n] of Object.entries(value as Record<string, unknown>)) {
      if (![...OPS, "raw"].includes(op)) problems.push(`${BASELINE_FILE}: "${file}" has unknown operation "${op}". Allowed: ${[...OPS, "raw"].join(", ")}.`);
      else if (!Number.isInteger(n) || (n as number) < 1) problems.push(`${BASELINE_FILE}: "${file}" ${op} must be a whole number of 1 or more, not ${JSON.stringify(n)}. Remove the operation if the file no longer has it.`);
      else counts[op] = n as number;
    }
    baseline[file] = counts;
  }
  return { baseline, problems };
}

/** Returns a message for every file whose member writes exceed the baseline (or that is not in it). */
export function findNewWrites(files: Record<string, string>, baseline: Baseline): string[] {
  const problems: string[] = [];
  for (const [rel, text] of Object.entries(files)) {
    const found = countMemberWrites(text);
    const allowed = baseline[rel] ?? {};
    for (const [op, n] of Object.entries(found)) {
      if (n > (allowed[op] ?? 0)) {
        problems.push(
          `${rel}: ${n} member.${op} write(s), baseline allows ${allowed[op] ?? 0}. A new direct Member write needs review: use withMemberLock (F8.2.4b) or get AJ's approval before adding it to ${BASELINE_FILE}.`,
        );
      }
    }
  }
  return problems;
}

/** Returns a message for every baseline entry that no longer matches the code. */
export function findStaleEntries(baseline: Baseline, read: (rel: string) => string | null): string[] {
  const problems: string[] = [];
  for (const [rel, allowed] of Object.entries(baseline)) {
    const text = read(rel);
    if (text === null) {
      problems.push(`${rel} is in the baseline but the file no longer exists. Remove its entry from ${BASELINE_FILE}.`);
      continue;
    }
    const found = countMemberWrites(text);
    for (const op of new Set([...Object.keys(allowed), ...Object.keys(found)])) {
      if ((found[op] ?? 0) !== (allowed[op] ?? 0)) {
        problems.push(`${rel}: baseline says ${allowed[op] ?? 0} member.${op}, the code has ${found[op] ?? 0}. Update ${BASELINE_FILE} to match (a lower count is a removal and still needs the baseline edited).`);
      }
    }
  }
  return problems;
}

const readRepoFile = (rel: string) => (existsSync(path.join(ROOT, rel)) ? readFileSync(path.join(ROOT, rel), "utf8") : null);

describe("Member write baseline guard (F8.2.4a)", () => {
  it("detects a new write in an unlisted file", () => {
    const files = { "src/modules/new/x.ts": "await prisma.member.create({ data })" };
    expect(findNewWrites(files, {})).toEqual([expect.stringContaining("src/modules/new/x.ts: 1 member.create write(s), baseline allows 0")]);
  });

  it("detects an extra write in a listed file, and raw SQL", () => {
    const baseline = { "src/modules/team/team.ts": { update: 3, delete: 1 } };
    const files = {
      "src/modules/team/team.ts": "tx.member.update({}); tx.member.update({}); tx.member.update({}); tx.member.update({}); tx.member.delete({})",
      "src/modules/y.ts": 'await db.$executeRaw`INSERT INTO "member" (id) VALUES (1)`',
    };
    expect(findNewWrites(files, baseline)).toEqual([
      expect.stringContaining("src/modules/team/team.ts: 4 member.update write(s), baseline allows 3"),
      expect.stringContaining("src/modules/y.ts: 1 member.raw write(s), baseline allows 0"),
    ]);
  });

  it.each([
    ["multi-line Prisma write", "await prisma.member\n  .create({ data })", { create: 1 }],
    ["multi-line with comment-free spacing", "await tx.member   .\n   update({})", { update: 1 }],
    ["optional chaining", "await db.member?.delete({})", { delete: 1 }],
    ["bracket access", 'await prisma["member"].upsert({})', { upsert: 1 }],
    ["public.member raw", 'await db.$executeRaw`UPDATE public.member SET role = 1`', { raw: 1 }],
    ['"public"."member" raw', 'await db.$executeRawUnsafe(`DELETE FROM "public"."member" WHERE 1=1`)', { raw: 1 }],
    ["plain member raw", "INSERT INTO member (id) VALUES (1)", { raw: 1 }],
    ["write after a // inside a string", 'const u = "http://x"; await prisma.member.create({})', { create: 1 }],
  ])("finds %s", (_label, text, expected) => {
    expect(countMemberWrites(text)).toEqual(expected);
  });

  it.each([
    ["line comment", "// prisma.member.create({})\n"],
    ["block comment", "/* member.delete( */"],
    ["reads", "await prisma.member.findMany({}); await prisma.member.count({})"],
    ["other models", "await prisma.staffMember.create({}); await prisma.memberSelection.update({})"],
    ["other tables in SQL", 'await db.$executeRaw`UPDATE member_selection SET a = 1`'],
  ])("ignores %s", (_label, text) => {
    expect(countMemberWrites(text)).toEqual({});
  });

  describe("baseline file validation", () => {
    it("accepts the real baseline and ignores _comment", () => {
      const { baseline, problems } = loadBaseline(readFileSync(BASELINE_PATH, "utf8"));
      expect(problems).toEqual([]);
      expect(Object.keys(baseline).length).toBeGreaterThan(0);
    });

    it.each([
      ["invalid JSON", "{ not json", /not valid JSON/],
      ["an array", "[]", /must be a JSON object/],
      ["a path outside src", '{ "apps/x.ts": { "create": 1 } }', /must be a path starting with "src\/"/],
      ["a non-object entry", '{ "src/a.ts": 3 }', /must be an object/],
      ["an unknown operation", '{ "src/a.ts": { "findMany": 1 } }', /unknown operation "findMany"/],
      ["a zero count", '{ "src/a.ts": { "create": 0 } }', /whole number of 1 or more/],
      ["a string count", '{ "src/a.ts": { "create": "1" } }', /whole number of 1 or more/],
    ])("reports %s", (_label, text, message) => {
      expect(loadBaseline(text).problems).toEqual([expect.stringMatching(message)]);
    });
  });

  describe("stale entries", () => {
    it("reports a deleted file, a lower count and a higher count with the fix to make", () => {
      const baseline = { "src/gone.ts": { create: 1 }, "src/low.ts": { update: 2 }, "src/high.ts": { delete: 1 } };
      const sources: Record<string, string | null> = { "src/gone.ts": null, "src/low.ts": "tx.member.update({})", "src/high.ts": "tx.member.delete({}); tx.member.delete({})" };
      const problems = findStaleEntries(baseline, (rel) => sources[rel]);
      expect(problems).toEqual([
        expect.stringMatching(/src\/gone\.ts is in the baseline but the file no longer exists\. Remove its entry/),
        expect.stringMatching(/src\/low\.ts: baseline says 2 member\.update, the code has 1\. Update/),
        expect.stringMatching(/src\/high\.ts: baseline says 1 member\.delete, the code has 2\. Update/),
      ]);
    });
  });

  it("finds no member write in src beyond the baseline", () => {
    const { baseline, problems } = loadBaseline(readFileSync(BASELINE_PATH, "utf8"));
    expect(problems, `${BASELINE_FILE} is malformed`).toEqual([]);
    const files: Record<string, string> = {};
    for (const full of sourceFiles(SRC)) {
      if (!isTestOrGenerated(path.relative(SRC, full))) files[path.relative(ROOT, full).split(path.sep).join("/")] = readFileSync(full, "utf8");
    }
    expect(findNewWrites(files, baseline), SCOPE_NOTE).toEqual([]);
  });

  it("baseline matches the code today (no stale entries)", () => {
    const { baseline, problems } = loadBaseline(readFileSync(BASELINE_PATH, "utf8"));
    expect(problems, `${BASELINE_FILE} is malformed`).toEqual([]);
    expect(findStaleEntries(baseline, readRepoFile), SCOPE_NOTE).toEqual([]);
  });
});
