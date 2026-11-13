import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
const { inviteTokenFrom } = await import("../invite-signup");

describe("inviteTokenFrom", () => {
  const token = "A".repeat(43);
  it("reads the invitation token from the page's query string", () => {
    expect(inviteTokenFrom(`invite=${token}`)).toBe(token);
    expect(inviteTokenFrom(`foo=1&invite=${token}&email=x`)).toBe(token);
  });
  it("ignores a missing, too short or oversized token", () => {
    expect(inviteTokenFrom(null)).toBeNull();
    expect(inviteTokenFrom("")).toBeNull();
    expect(inviteTokenFrom("invite=short")).toBeNull();
    expect(inviteTokenFrom(`invite=${"A".repeat(201)}`)).toBeNull();
    expect(inviteTokenFrom(`invite=${token}&x=${"y".repeat(4000)}`)).toBeNull();
  });
});
