import { prisma } from "@/lib/db";

/**
 * The plan tests need the "catering" product to exist: `plan.productKey` is a foreign key to it, `createPlan` refuses an unknown
 * product or one with no manifest (the entitlement keys come from the manifest), and the site-content code is keyed to
 * "catering", so another key would not test the real thing. A migrated empty database (CI) has no products, so this adds a
 * minimal one with a manifest that defines one limit (the marker test edits it). The insert skips a duplicate, so a real catering
 * product (a shared dev database) is left exactly as it is, and the returned function removes the product only when it was
 * added here.
 */
export async function ensureCateringProduct(): Promise<() => Promise<void>> {
  const { count } = await prisma.product.createMany({
    data: [
      {
        key: "catering",
        name: "Catering",
        baseUrl: "https://catering.example",
        outboundSecret: "x",
        inboundSecret: "x",
        manifest: { entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }] },
      },
    ],
    skipDuplicates: true,
  });
  return async () => {
    if (count > 0) await prisma.product.deleteMany({ where: { key: "catering" } });
  };
}
