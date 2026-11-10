import { describe, expect, it } from "vitest";
import { mailGuard } from "../index";

const REAL = "https://api.zeptomail.in/v1.1/email";

describe("mail guard", () => {
  it("lets real email go to AJ's address only, whatever the capitals or spaces", () => {
    expect(mailGuard("npjalota@gmail.com", REAL, {})).toEqual({ allowed: true });
    expect(mailGuard("  NPJalota@Gmail.com ", REAL, {})).toEqual({ allowed: true });
    for (const to of ["customer@example.com", "npjalota@gmail.com.evil.test", "x@npjalota@gmail.com", ""]) expect(mailGuard(to, REAL, {}).allowed, to).toBe(false);
  });

  it("never restricts the local mail sink", () => {
    for (const url of ["http://localhost:3600/v1.1/email", "http://127.0.0.1:3600/v1.1/email", "http://[::1]:3600/x", "http://mail.localhost:3600/x"]) expect(mailGuard("anyone@example.com", url, {}), url).toEqual({ allowed: true });
  });

  it("is on by default, and only MAIL_GUARD=off (a go-live step) switches it off", () => {
    expect(mailGuard("anyone@example.com", REAL, {}).allowed).toBe(false);
    expect(mailGuard("anyone@example.com", REAL, { MAIL_GUARD: "on" }).allowed).toBe(false);
    expect(mailGuard("anyone@example.com", REAL, { MAIL_GUARD: " OFF " }).allowed).toBe(true);
  });

  it("an unreadable address counts as real, and MAIL_GUARD_ALLOW replaces the allowed list", () => {
    expect(mailGuard("anyone@example.com", "not a url", {}).allowed).toBe(false);
    expect(mailGuard("a@x.test", REAL, { MAIL_GUARD_ALLOW: "a@x.test, b@x.test" }).allowed).toBe(true);
    expect(mailGuard("npjalota@gmail.com", REAL, { MAIL_GUARD_ALLOW: "a@x.test" }).allowed).toBe(false);
  });
});
