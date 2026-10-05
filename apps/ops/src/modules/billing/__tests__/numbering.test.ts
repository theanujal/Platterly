import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { NumberingError, derivePrefix, lastInvoiceNumber, nextInvoiceNumber, setInvoicePrefix } from "../numbering";

const A = "numtesta";
const B = "numtestb";

async function clean() {
  await prisma.product.deleteMany({ where: { key: { in: [A, B] } } });
}
beforeEach(clean);
afterEach(clean);

describe("derivePrefix", () => {
  it("takes the first letters of the key, and stays unique among the prefixes taken", () => {
    expect(derivePrefix("catering", [])).toBe("CAT");
    expect(derivePrefix("catering", ["CAT"])).toBe("CAT2");
    expect(derivePrefix("catering", ["CAT", "CAT2"])).toBe("CAT3");
    expect(derivePrefix("a-b", [])).toBe("AB");
    expect(derivePrefix("cat", ["cat"])).toBe("CAT2");
  });
});

describe("per-product numbering", () => {
  it("a new product gets its own prefix and a counter at zero, and numbers run separately per product", async () => {
    const a = (await registerProduct({ key: A, name: "A", baseUrl: "http://127.0.0.1:1", actorUserId: null })).product;
    const b = (await registerProduct({ key: B, name: "B", baseUrl: "http://127.0.0.1:2", actorUserId: null })).product;
    expect(a.invoicePrefix).toBeTruthy();
    expect(b.invoicePrefix).toBeTruthy();
    expect(a.invoicePrefix).not.toBe(b.invoicePrefix);
    expect(await lastInvoiceNumber(A)).toBe(0);
    expect([await nextInvoiceNumber(prisma, A), await nextInvoiceNumber(prisma, A), await nextInvoiceNumber(prisma, B)]).toEqual([1, 2, 1]);
    expect(await lastInvoiceNumber(A)).toBe(2);
    expect(await lastInvoiceNumber(B)).toBe(1);
  });

  it("many payments at once get different numbers, without gaps", async () => {
    await registerProduct({ key: A, name: "A", baseUrl: "http://127.0.0.1:1", actorUserId: null });
    const numbers = await Promise.all(Array.from({ length: 20 }, () => nextInvoiceNumber(prisma, A)));
    expect([...numbers].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("a rolled-back transaction leaves no gap", async () => {
    await registerProduct({ key: A, name: "A", baseUrl: "http://127.0.0.1:1", actorUserId: null });
    await nextInvoiceNumber(prisma, A);
    await prisma.$transaction(async (tx) => {
      await nextInvoiceNumber(tx, A);
      throw new Error("payment failed to confirm");
    }).catch(() => undefined);
    expect(await nextInvoiceNumber(prisma, A)).toBe(2);
  });

  it("counts from a product that has no counter row yet", async () => {
    await prisma.product.create({ data: { key: A, name: "A", baseUrl: "http://127.0.0.1:1", outboundSecret: "x", inboundSecret: "x" } });
    expect(await nextInvoiceNumber(prisma, A)).toBe(1);
  });

  it("changing the prefix is checked: format, and no two products share one", async () => {
    await registerProduct({ key: A, name: "A", baseUrl: "http://127.0.0.1:1", actorUserId: null });
    const b = (await registerProduct({ key: B, name: "B", baseUrl: "http://127.0.0.1:2", actorUserId: null })).product;
    expect(await setInvoicePrefix(A, " nta7 ", null)).toBe("NTA7");
    await expect(setInvoicePrefix(A, "", null)).rejects.toThrow(NumberingError);
    await expect(setInvoicePrefix(A, "TOOLONGX", null)).rejects.toThrow(/1 to 6/);
    await expect(setInvoicePrefix(A, "bad-1", null)).rejects.toThrow(NumberingError);
    await expect(setInvoicePrefix(B, "nta7", null)).rejects.toThrow(/already the invoice prefix of A/);
    await expect(setInvoicePrefix("nosuch", "ZZ", null)).rejects.toThrow(/not found/);
    // Its own prefix again is fine, and the other product is unchanged.
    expect(await setInvoicePrefix(A, "NTA7", null)).toBe("NTA7");
    expect((await prisma.product.findUniqueOrThrow({ where: { key: B } })).invoicePrefix).toBe(b.invoicePrefix);
  });
});
