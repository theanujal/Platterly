import { describe, expect, it } from "vitest";
import { initials, LINK_LABEL, PRODUCTS, STATUS_LABEL } from "../catalogue";
import { INITIAL_STATE, parseStored, reduce, selectedProduct } from "../state";

describe("account product switcher state", () => {
  it("starts on Caterly and keeps nothing but the product choice", () => {
    expect(selectedProduct(INITIAL_STATE).id).toBe("caterly");
    expect(Object.keys(INITIAL_STATE)).toEqual(["selectedProduct"]);
  });

  it("switches product, and ignores an id that is not one of the products", () => {
    expect(reduce(INITIAL_STATE, { type: "selectProduct", id: "rivo" }).selectedProduct).toBe("rivo");
    expect(PRODUCTS.map((p) => p.id)).toEqual(["caterly", "rivo"]);
    // @ts-expect-error an unknown product id must be refused at runtime too
    expect(reduce(INITIAL_STATE, { type: "selectProduct", id: "nope" })).toBe(INITIAL_STATE);
  });

  it("reads a saved choice back, and falls back on anything else", () => {
    expect(parseStored(JSON.stringify({ selectedProduct: "rivo" })).selectedProduct).toBe("rivo");
    for (const bad of [null, "", "{", "[]", JSON.stringify({ selectedProduct: "nope" }), JSON.stringify({ selectedProduct: 3 })]) expect(parseStored(bad)).toBe(INITIAL_STATE);
  });

  it("labels the states the server can report, and nothing else", () => {
    expect(Object.keys(LINK_LABEL).sort()).toEqual(["linked", "none", "suspended"]);
    expect(Object.keys(STATUS_LABEL).sort()).toEqual(["active", "suspended"]);
  });

  it("makes initials from a name or an email", () => {
    expect(initials("Spice Route Caterers")).toBe("SR");
    expect(initials("meera@x.in")).toBe("MX");
    expect(initials("")).toBe("?");
  });
});
