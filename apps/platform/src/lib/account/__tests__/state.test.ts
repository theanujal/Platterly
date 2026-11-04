import { describe, expect, it } from "vitest";
import { BUSINESSES, INITIAL_CATERLY, initials } from "../mock-data";
import { INITIAL_STATE, parseStored, reduce, selectedBusiness } from "../state";

describe("account prototype state", () => {
  it("starts on the first business with Caterly active there", () => {
    expect(selectedBusiness(INITIAL_STATE).id).toBe(BUSINESSES[0].id);
    expect(INITIAL_STATE.caterly[BUSINESSES[0].id].status).toBe("active");
  });

  it("has a Caterly link for every business and one of each status, so every state can be shown", () => {
    expect(Object.keys(INITIAL_CATERLY).sort()).toEqual(BUSINESSES.map((b) => b.id).sort());
    expect(new Set(Object.values(INITIAL_CATERLY).map((l) => l.status))).toEqual(new Set(["active", "trial", "none"]));
  });

  it("switches business, and ignores an id that is not one of the user's businesses", () => {
    const next = reduce(INITIAL_STATE, { type: "selectBusiness", id: BUSINESSES[2].id });
    expect(next.selectedBusinessId).toBe(BUSINESSES[2].id);
    expect(reduce(INITIAL_STATE, { type: "selectBusiness", id: "someone-elses-business" })).toBe(INITIAL_STATE);
  });

  it("sets up Caterly only where it is not set up, and never downgrades an active or trial link", () => {
    const none = BUSINESSES.find((b) => INITIAL_CATERLY[b.id].status === "none")!;
    expect(reduce(INITIAL_STATE, { type: "setUpCaterly", businessId: none.id }).caterly[none.id].status).toBe("trial");
    for (const b of BUSINESSES.filter((x) => x.id !== none.id)) {
      expect(reduce(INITIAL_STATE, { type: "setUpCaterly", businessId: b.id })).toBe(INITIAL_STATE);
    }
    expect(reduce(INITIAL_STATE, { type: "setUpCaterly", businessId: "unknown" })).toBe(INITIAL_STATE);
  });

  it("does not change the other businesses when one is set up, and does not mutate the previous state", () => {
    const none = BUSINESSES.find((b) => INITIAL_CATERLY[b.id].status === "none")!;
    const next = reduce(INITIAL_STATE, { type: "setUpCaterly", businessId: none.id });
    expect(INITIAL_STATE.caterly[none.id].status).toBe("none");
    for (const b of BUSINESSES.filter((x) => x.id !== none.id)) expect(next.caterly[b.id]).toBe(INITIAL_STATE.caterly[b.id]);
  });

  it("toggles the Rivo notification and the product-updates preference", () => {
    const on = reduce(INITIAL_STATE, { type: "toggleRivoNotify" });
    expect(on.rivoNotify).toBe(true);
    expect(reduce(on, { type: "toggleRivoNotify" }).rivoNotify).toBe(false);
    expect(reduce(INITIAL_STATE, { type: "setProductUpdates", value: false }).productUpdates).toBe(false);
  });

  it("saves a profile", () => {
    const profile = { ...INITIAL_STATE.profile, fullName: "Meera K." };
    expect(reduce(INITIAL_STATE, { type: "saveProfile", profile }).profile.fullName).toBe("Meera K.");
  });

  it("reads back what it saved, and falls back to the initial state for anything else", () => {
    const saved = reduce(INITIAL_STATE, { type: "selectBusiness", id: BUSINESSES[1].id });
    expect(parseStored(JSON.stringify(saved))).toEqual(saved);
    for (const bad of [null, "", "not json", "{}", "[]", JSON.stringify({ ...saved, selectedBusinessId: "gone" }), JSON.stringify({ ...saved, caterly: {} }), JSON.stringify({ ...saved, profile: { fullName: 1 } }), JSON.stringify({ ...saved, rivoNotify: "yes" })]) {
      expect(parseStored(bad)).toBe(INITIAL_STATE);
    }
  });

  it("makes initials from a business name", () => {
    expect(initials("Spice Route Caterers")).toBe("SR");
    expect(initials("Saffron & Co. Events")).toBe("SC");
    expect(initials("Basil")).toBe("BA");
  });
});
