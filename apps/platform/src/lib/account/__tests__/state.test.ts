import { describe, expect, it } from "vitest";
import { BUSINESS, INITIAL_CATERLY, PRODUCTS, initials } from "../mock-data";
import { INITIAL_STATE, parseStored, reduce, selectedProduct } from "../state";

describe("account prototype state", () => {
  it("has exactly one business with the single central role Admin", () => {
    expect(BUSINESS.role).toBe("Admin");
    expect(Object.keys(INITIAL_STATE).sort()).not.toContain("selectedBusinessId");
  });

  it("starts on Caterly, with Caterly not set up yet so the whole activation path can be shown", () => {
    expect(selectedProduct(INITIAL_STATE).id).toBe("caterly");
    expect(INITIAL_STATE.caterly).toBe(INITIAL_CATERLY);
    expect(INITIAL_STATE.caterly.status).toBe("none");
  });

  it("switches product, and ignores an id that is not one of the products", () => {
    const next = reduce(INITIAL_STATE, { type: "selectProduct", id: "rivo" });
    expect(next.selectedProduct).toBe("rivo");
    expect(PRODUCTS.map((p) => p.id)).toEqual(["caterly", "rivo"]);
    // @ts-expect-error an unknown product id must be refused at runtime too
    expect(reduce(INITIAL_STATE, { type: "selectProduct", id: "nope" })).toBe(INITIAL_STATE);
  });

  it("sets up Caterly only when it is not set up, and never downgrades an active or trial link", () => {
    const trial = reduce(INITIAL_STATE, { type: "setUpCaterly" });
    expect(trial.caterly.status).toBe("trial");
    expect(INITIAL_STATE.caterly.status).toBe("none");
    expect(reduce(trial, { type: "setUpCaterly" })).toBe(trial);
    const active = { ...INITIAL_STATE, caterly: { status: "active" as const, detail: "x" } };
    expect(reduce(active, { type: "setUpCaterly" })).toBe(active);
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

  it("reads back what it saved, and falls back to the initial state for anything else (including the old multi-business shape)", () => {
    const saved = reduce(reduce(INITIAL_STATE, { type: "selectProduct", id: "rivo" }), { type: "setUpCaterly" });
    expect(parseStored(JSON.stringify(saved))).toEqual(saved);
    const old = { selectedBusinessId: "spice-route", caterly: { "spice-route": { status: "active", detail: "x" } }, rivoNotify: false, productUpdates: true, profile: saved.profile };
    for (const bad of [null, "", "not json", "{}", "[]", JSON.stringify(old), JSON.stringify({ ...saved, selectedProduct: "gone" }), JSON.stringify({ ...saved, caterly: {} }), JSON.stringify({ ...saved, profile: { fullName: 1 } }), JSON.stringify({ ...saved, rivoNotify: "yes" })]) {
      expect(parseStored(bad)).toBe(INITIAL_STATE);
    }
  });

  it("makes initials from a business name", () => {
    expect(initials("Spice Route Caterers")).toBe("SR");
    expect(initials("Saffron & Co. Events")).toBe("SC");
    expect(initials("Basil")).toBe("BA");
  });
});
