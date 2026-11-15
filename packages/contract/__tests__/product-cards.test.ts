import { describe, expect, it } from "vitest";
import { BUILTIN_CARD_IMAGES, isCardImageRef, parsePlatformProductCards } from "../index";

const card = (over: Record<string, unknown> = {}) => ({ key: "rivo", name: "Rivo", tagline: "Business growth platform", image: "builtin:growth", status: "UPCOMING", launchAt: "2026-12-01T09:00:00.000Z", ...over });
const answer = (products: unknown[]) => ({ generatedAt: "2026-11-15T10:00:00.000Z", products });

describe("product cards (the My Products page)", () => {
  it("accepts a live card and an upcoming card, with or without a picture and date", () => {
    const parsed = parsePlatformProductCards(answer([card({ key: "catering", name: "Caterly", status: "LIVE", launchAt: null }), card(), card({ key: "supply", image: null, tagline: null, launchAt: null })]));
    expect(parsed.ok && parsed.value.products.map((p) => p.key)).toEqual(["catering", "rivo", "supply"]);
  });

  it("knows the built-in pictures and uploaded picture names, and nothing else", () => {
    for (const name of BUILTIN_CARD_IMAGES) expect(isCardImageRef(`builtin:${name}`)).toBe(true);
    expect(isCardImageRef("upload:3fa9c1d2-rivo-card.png")).toBe(true);
    for (const bad of ["builtin:nope", "upload:../secret.png", "upload:UPPER.png", "upload:", "https://evil.test/x.png", "/uploads/x.png", "", null, 7]) expect(isCardImageRef(bad), String(bad)).toBe(false);
  });

  it.each([
    ["a key that is not valid", card({ key: "Not Valid" })],
    ["a missing name", card({ name: " " })],
    ["a picture that is a web address", card({ image: "https://evil.test/x.png" })],
    ["a status that is neither", card({ status: "SOON" })],
    ["a launch date that is not a date", card({ launchAt: "tomorrow" })],
    ["a tagline that is too long", card({ tagline: "x".repeat(301) })],
  ])("refuses %s", (_label, bad) => {
    expect(parsePlatformProductCards(answer([bad])).ok).toBe(false);
  });

  it("refuses a repeated key and a body that is not the expected shape", () => {
    expect(parsePlatformProductCards(answer([card(), card()])).ok).toBe(false);
    expect(parsePlatformProductCards(null).ok).toBe(false);
    expect(parsePlatformProductCards({ generatedAt: "nope", products: [] }).ok).toBe(false);
    expect(parsePlatformProductCards({ generatedAt: "2026-11-15T10:00:00.000Z", products: "x" }).ok).toBe(false);
  });
});
