import { describe, expect, it } from "vitest";
import { EMAIL_TRIM_CODES, EMAIL_TRIM_SQL, normaliseEmail } from "../email";
import { USER_STATUSES, isUserStatus } from "../status";

const NBSP = " ";
const SIX = EMAIL_TRIM_CODES.map((code) => String.fromCharCode(code));

// Test-only model of PostgreSQL's two-argument btrim: strips the given characters from both ends. It does not run any SQL.
function dbBtrim(value: string, chars: readonly string[]): string {
  let start = 0;
  let end = value.length;
  while (start < end && chars.includes(value[start])) start++;
  while (end > start && chars.includes(value[end - 1])) end--;
  return value.slice(start, end);
}

describe("user status", () => {
  it("has exactly active and disabled", () => {
    expect([...USER_STATUSES]).toEqual(["active", "disabled"]);
  });

  it("accepts only those two values, exactly", () => {
    expect(isUserStatus("active")).toBe(true);
    expect(isUserStatus("disabled")).toBe(true);
    for (const bad of ["Active", "DISABLED", " active", "active ", "pending", "", null, undefined, 1, {}]) {
      expect(isUserStatus(bad)).toBe(false);
    }
  });
});

describe("email trim set", () => {
  it("is exactly the six approved ASCII characters, by code", () => {
    expect([...EMAIL_TRIM_CODES]).toEqual([32, 9, 10, 11, 12, 13]);
    expect(SIX).toEqual([" ", "\t", "\n", "\u000b", "\f", "\r"]);
  });

  it("is written as chr() calls with no backslash", () => {
    expect(EMAIL_TRIM_SQL).toBe("chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)");
    expect(EMAIL_TRIM_SQL).not.toContain("\\");
  });

  it("model of the database trim removes each of the six from both ends and leaves the letter v alone", () => {
    for (const ch of SIX) {
      expect(dbBtrim(`${ch}a@x.in`, SIX)).toBe("a@x.in");
      expect(dbBtrim(`a@x.in${ch}`, SIX)).toBe("a@x.in");
      expect(dbBtrim(`${ch}${ch}a@x.in${ch}`, SIX)).toBe("a@x.in");
      expect(dbBtrim(`a${ch}b@x.in`, SIX)).toBe(`a${ch}b@x.in`);
    }
    for (const email of ["vv@x.in", "v@x.in", "vikram@x.in", "a@xv"]) expect(dbBtrim(email, SIX)).toBe(email);
    expect(dbBtrim("vikram@x.in", ["v"])).not.toBe("vikram@x.in");
  });

  it("model of the database trim does not remove a non-breaking space (raw SQL differs from the helper)", () => {
    expect(dbBtrim(`${NBSP}a@x.in`, SIX)).toBe(`${NBSP}a@x.in`);
  });
});

describe("normaliseEmail", () => {
  it("trims, lower-cases and returns the address", () => {
    expect(normaliseEmail(" AJ@example.com ")).toBe("aj@example.com");
    expect(normaliseEmail("Mixed.Case@Example.COM")).toBe("mixed.case@example.com");
  });

  it("returns null for an empty or whitespace-only value", () => {
    expect(normaliseEmail("")).toBeNull();
    expect(normaliseEmail("   ")).toBeNull();
    expect(normaliseEmail(`${NBSP}${NBSP}`)).toBeNull();
    expect(normaliseEmail(SIX.join(""))).toBeNull();
  });

  it("returns null when whitespace remains inside", () => {
    expect(normaliseEmail("AJ @example.com")).toBeNull();
    expect(normaliseEmail("a b@x.in")).toBeNull();
    expect(normaliseEmail(`a${NBSP}b@x.in`)).toBeNull();
  });

  it("trims each of the six characters at either end and rejects each inside", () => {
    for (const ch of SIX) {
      expect(normaliseEmail(`${ch}a@x.in`)).toBe("a@x.in");
      expect(normaliseEmail(`a@x.in${ch}`)).toBe("a@x.in");
      expect(normaliseEmail(`${ch}A@X.in${ch}`)).toBe("a@x.in");
      expect(normaliseEmail(`a${ch}b@x.in`)).toBeNull();
    }
  });

  it("trims a leading or trailing non-breaking space and rejects an internal one", () => {
    expect(normaliseEmail(`${NBSP}a@x.in`)).toBe("a@x.in");
    expect(normaliseEmail(`a@x.in${NBSP}`)).toBe("a@x.in");
    expect(normaliseEmail(`${NBSP}A@x.in${NBSP}`)).toBe("a@x.in");
    expect(normaliseEmail(`a${NBSP}b@x.in`)).toBeNull();
  });

  it("leaves the letter v and an already normalised address unchanged", () => {
    expect(normaliseEmail("vv@x.in")).toBe("vv@x.in");
    expect(normaliseEmail("vikram@x.in")).toBe("vikram@x.in");
    const once = normaliseEmail("  AJ@Example.com ");
    expect(once).not.toBeNull();
    expect(normaliseEmail(once as string)).toBe(once);
  });

  it("does no format validation", () => {
    expect(normaliseEmail("not-an-address")).toBe("not-an-address");
  });
});
