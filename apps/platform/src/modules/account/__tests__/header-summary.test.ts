import { describe, expect, it } from "vitest";
import { buildHeaderSummary, initialsOf } from "../header-summary";
import { corsHeaders, siteOrigins } from "../site-origins";
import type { AccountOverview, AccountProductCard } from "../types";

const card = (accountKey: string, name: string) => ({ key: accountKey, accountKey, name }) as unknown as AccountProductCard;
const overview = (over: Partial<Extract<AccountOverview["business"], { state: "ok" }>> | null, name = "Priya Menon"): AccountOverview => ({
  user: { id: "u1", email: "priya@x.test", emailVerified: true, name },
  business: over
    ? { state: "ok", business: { id: "b1", name: "Spice Route", status: "active", role: "Admin" }, products: { caterly: "linked", rivo: "none" }, team: [], openUrls: { caterly: "https://catering.platterly.in/dashboard" }, ...over }
    : { state: "none" },
});

describe("initials", () => {
  it("uses the first and last word of the name", () => {
    expect(initialsOf("Priya Menon", "p@x.test")).toBe("PM");
    expect(initialsOf("Priya Anne Menon", "p@x.test")).toBe("PM");
    expect(initialsOf("priya", "p@x.test")).toBe("P");
  });
  it("falls back to the email when there is no name", () => {
    expect(initialsOf(undefined, "zed@x.test")).toBe("Z");
    expect(initialsOf("   ", "zed@x.test")).toBe("Z");
  });
});

describe("the header summary", () => {
  const cards = [card("caterly", "Caterly by Platterly")];
  it("is signed out when there is no overview", () => {
    expect(buildHeaderSummary({ overview: null, cards, photoUrl: null, accountUrl: "https://account.x/" })).toEqual({ status: "signed_out" });
  });
  it("lists one linked product with its dashboard address", () => {
    const s = buildHeaderSummary({ overview: overview({}), cards, photoUrl: null, accountUrl: "https://account.x/" });
    expect(s).toMatchObject({ status: "signed_in", name: "Priya Menon", initials: "PM", photoUrl: null, products: [{ key: "caterly", name: "Caterly by Platterly", openUrl: "https://catering.platterly.in/dashboard" }] });
  });
  it("lists several products in catalogue order and skips suspended, unlinked or address-less ones", () => {
    const both = buildHeaderSummary({ overview: overview({ products: { caterly: "linked", rivo: "linked" }, openUrls: { caterly: "https://c/dashboard", rivo: "https://r/dashboard" } }), cards: [], photoUrl: null, accountUrl: "a" });
    expect(both.status === "signed_in" && both.products.map((p) => p.name)).toEqual(["Caterly by Platterly", "Rivo"]);
    const skipped = buildHeaderSummary({ overview: overview({ products: { caterly: "suspended", rivo: "linked" }, openUrls: { caterly: "https://c/dashboard" } }), cards: [], photoUrl: null, accountUrl: "a" });
    expect(skipped.status === "signed_in" && skipped.products).toEqual([]);
  });
  it("has no products for a person with no business, and names them from the email when there is no name", () => {
    const s = buildHeaderSummary({ overview: overview(null, ""), cards, photoUrl: "https://account.x/api/account/photo?v=1", accountUrl: "https://account.x/" });
    expect(s).toMatchObject({ status: "signed_in", name: "priya", initials: "P", products: [], photoUrl: "https://account.x/api/account/photo?v=1" });
  });
  it("never carries the email, the business name or the team", () => {
    const text = JSON.stringify(buildHeaderSummary({ overview: overview({}), cards, photoUrl: null, accountUrl: "a" }));
    expect(text).not.toContain("priya@x.test");
    expect(text).not.toContain("Spice Route");
  });
});

describe("who may read it", () => {
  it("allows the site's own addresses and nobody else", () => {
    expect(siteOrigins({} as NodeJS.ProcessEnv, "localhost:3300")).toEqual(["http://localhost:3100"]);
    expect(siteOrigins({} as NodeJS.ProcessEnv, "platterly.in")).toEqual(["https://platterly.in", "https://www.platterly.in"]);
    expect(siteOrigins({ SITE_ORIGINS: "https://a.test, https://b.test" } as unknown as NodeJS.ProcessEnv, "platterly.in")).toEqual(["https://a.test", "https://b.test"]);
    const allowed = ["https://platterly.in"];
    expect(corsHeaders("https://platterly.in", allowed)).toMatchObject({ "access-control-allow-origin": "https://platterly.in", "access-control-allow-credentials": "true", vary: "Origin" });
    expect(corsHeaders("https://evil.test", allowed)["access-control-allow-origin"]).toBeUndefined();
    expect(corsHeaders(null, allowed)["access-control-allow-origin"]).toBeUndefined();
  });
});
