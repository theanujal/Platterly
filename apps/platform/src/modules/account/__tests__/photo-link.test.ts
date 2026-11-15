import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { photoLinkUrl, verifyPhotoLink } from "../photo-link";

const SECRET = "x".repeat(40);
let before: string | undefined;
beforeEach(() => {
  before = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = SECRET;
});
afterEach(() => {
  if (before === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = before;
});

describe("the signed photo address", () => {
  it("verifies for the person and version it was made for, and for nothing else", () => {
    const url = new URL(photoLinkUrl("https://accounts.example", "user_1", "1700000000000")!);
    const [u, v, s] = ["u", "v", "s"].map((k) => url.searchParams.get(k)!);
    expect(url.pathname).toBe("/api/account/photo/shared");
    expect(verifyPhotoLink(u, v, s)).toBe(true);
    expect(verifyPhotoLink("user_2", v, s)).toBe(false);
    expect(verifyPhotoLink(u, "1700000000001", s)).toBe(false);
    expect(verifyPhotoLink(u, v, s.slice(0, -1) + (s.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(verifyPhotoLink(u, v, "")).toBe(false);
  });

  it("is refused when there is no secret to sign with", () => {
    delete process.env.AUTH_SECRET;
    expect(photoLinkUrl("https://accounts.example", "user_1", "1")).toBeNull();
    expect(verifyPhotoLink("user_1", "1", "abc")).toBe(false);
  });
});
