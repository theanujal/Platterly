import { describe, expect, it } from "vitest";
import type { fetchOpsProductCards } from "@/modules/store/ops-catalogue";
import { cardImageUrl, loadAccountProductCards, loadProductLogo } from "../product-cards";

type Fetch = typeof fetchOpsProductCards;
const cards = (products: Awaited<ReturnType<Fetch>> extends infer R ? (R extends { ok: true; cards: infer C } ? C : never) : never) => products;

describe("the Account's product cards (from Ops)", () => {
  it("renames Ops's catering to caterly, keeps the order, and turns pictures into addresses of this app", async () => {
    const fetchCards: Fetch = async () => ({
      ok: true,
      cards: cards({
        generatedAt: "2026-11-15T10:00:00.000Z",
        products: [
          { key: "catering", name: "Caterly", tagline: "Catering business platform", image: "builtin:cloche", logo: "upload:cat-logo.png", about: null, features: [], status: "LIVE", launchAt: null },
          { key: "rivo", name: "Rivo", tagline: null, image: "upload:3fa9-rivo.png", logo: null, about: null, features: [], status: "UPCOMING", launchAt: "2026-12-01T09:00:00.000Z" },
          { key: "supply", name: "Supply", tagline: "Procurement", image: null, logo: null, about: null, features: [], status: "UPCOMING", launchAt: null },
        ],
      }),
    });
    const result = await loadAccountProductCards(fetchCards);
    expect(result).toEqual({
      status: "ok",
      cards: [
        { key: "catering", accountKey: "caterly", name: "Caterly", tagline: "Catering business platform", imageUrl: "/products/cloche.svg", logoUrl: "/api/account/product-image/cat-logo.png", about: null, features: [], status: "LIVE", launchAt: null },
        { key: "rivo", accountKey: "rivo", name: "Rivo", tagline: null, imageUrl: "/api/account/product-image/3fa9-rivo.png", logoUrl: null, about: null, features: [], status: "UPCOMING", launchAt: "2026-12-01T09:00:00.000Z" },
        { key: "supply", accountKey: "supply", name: "Supply", tagline: "Procurement", imageUrl: null, logoUrl: null, about: null, features: [], status: "UPCOMING", launchAt: null },
      ],
    });
  });

  it("says unavailable, and invents nothing, when Ops cannot be read", async () => {
    for (const reason of ["not_configured", "unreachable", "refused", "bad_answer"] as const) {
      expect(await loadAccountProductCards(async () => ({ ok: false, reason }))).toEqual({ status: "unavailable" });
    }
  });

  it("never turns an unknown picture reference into an address", () => {
    expect(cardImageUrl(null)).toBeNull();
    expect(cardImageUrl("https://evil.test/x.png")).toBeNull();
    expect(cardImageUrl("builtin:growth")).toBe("/products/growth.svg");
  });

  it("serves a product's logo only when Ops shows one for it, found by its Account key", async () => {
    const card = (key: string, logo: string | null) => ({ key, name: key, tagline: null, image: null, logo, about: null, features: [], status: "LIVE" as const, launchAt: null });
    const fetchCards: Fetch = async () => ({ ok: true, cards: cards({ generatedAt: "2026-11-15T10:00:00.000Z", products: [card("catering", "upload:cat-logo.png"), card("rivo", null)] }) });
    const asked: string[] = [];
    const fetchImage = async (name: string) => (asked.push(name), { ok: true as const, mime: "image/png", bytes: Buffer.from("x") });
    expect((await loadProductLogo("caterly", { fetchCards, fetchImage }))?.mime).toBe("image/png");
    expect(asked).toEqual(["cat-logo.png"]);
    expect(await loadProductLogo("rivo", { fetchCards, fetchImage })).toBeNull();
    expect(await loadProductLogo("unknown", { fetchCards, fetchImage })).toBeNull();
    expect(await loadProductLogo("caterly", { fetchCards: async () => ({ ok: false, reason: "unreachable" }), fetchImage })).toBeNull();
  });
});
