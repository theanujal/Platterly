import { describe, expect, it } from "vitest";
import { invitedFromQuery, planFromQuery } from "../sign-up-origin";

// What a product's sign-up link can add to the provider-signed address (the provider signs every part, so the person cannot add or change these).
describe("sign-up link extras", () => {
  it("an invitation link carries invite=1; anything else is not an invitation", () => {
    expect(invitedFromQuery("client_id=caterly&invite=1&sig=x")).toBe(true);
    expect(invitedFromQuery("client_id=caterly&invite=0")).toBe(false);
    expect(invitedFromQuery("client_id=caterly&invite=true")).toBe(false);
    expect(invitedFromQuery("client_id=caterly")).toBe(false);
  });
  it("a plan still needs a code and a billing interval", () => {
    expect(planFromQuery("plan=premium&interval=ANNUAL")).toEqual({ code: "premium", interval: "ANNUAL" });
    expect(planFromQuery("plan=premium")).toBeNull();
  });
});
