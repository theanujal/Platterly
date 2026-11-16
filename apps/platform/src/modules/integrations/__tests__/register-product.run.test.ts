import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { describe, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { getIntegration, getSecrets, normaliseBaseUrl, registerIntegration } from "../registry";

// Runner that registers a product (Caterly) with the Platform for the business link (go-live step 3c). There is no script runner for TypeScript here, so it is a
// vitest file that does nothing unless REGISTER_PRODUCT is "apply" or "check", like legacy-business-import.run.test.ts. Run it from apps/platform with the Platform's
// env file loaded (`set -a; . /srv/platterly/env/platform.env; set +a`), because the secrets are stored encrypted with PLATFORM_SECRETS_KEY and the running Platform
// must be able to read them back:
//   REGISTER_PRODUCT=apply PRODUCT_KEY=caterly PRODUCT_NAME=Caterly PRODUCT_BASE_URL=https://catering.platterly.in npx vitest run register-product.run --silent=false
//   REGISTER_PRODUCT=check PRODUCT_KEY=caterly PRODUCT_BASE_URL=https://catering.platterly.in npx vitest run register-product.run --silent=false
// `apply` prints the two secrets ONCE, as the lines to paste into the product's env file (catering.env): the Platform signs with PLATFORM_COMMAND_SECRETS, the product
// signs its answers with PLATFORM_ANSWER_SECRET. A repeat run changes nothing and prints no secrets. `check` prints the registration and proves the stored secrets can
// be read with the current key (it never prints them). Local use (http://*.localhost, a dev key) needs PRODUCT_ALLOW_LOCAL=1.
const mode = process.env.REGISTER_PRODUCT;

describe.skipIf(mode !== "apply" && mode !== "check")("register a product with the Platform (runner)", () => {
  it("registers or checks", async () => {
    const key = process.env.PRODUCT_KEY ?? "";
    const baseUrl = process.env.PRODUCT_BASE_URL ?? "";
    const local = process.env.PRODUCT_ALLOW_LOCAL === "1";
    if (!key || !baseUrl) throw new Error("PRODUCT_KEY and PRODUCT_BASE_URL are required");
    const normal = normaliseBaseUrl(baseUrl);
    const host = new URL(normal).hostname;
    if (!local && (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost"))) throw new Error(`${normal} is a local address; a live registration needs the product's public https address (PRODUCT_ALLOW_LOCAL=1 for a local run)`);
    if (!local && !process.env.PLATFORM_SECRETS_KEY) throw new Error("PLATFORM_SECRETS_KEY is not set: load the Platform's env file first, or the stored secrets could not be read by the running Platform");
    const targetUrl = process.env.DATABASE_URL ?? "";
    if (!targetUrl) throw new Error("DATABASE_URL is not set");

    const pool = new Pool({ connectionString: targetUrl, max: 1 });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
      console.log(`${mode} on database ${new URL(targetUrl).pathname.replace(/^\//, "")} for product ${key} at ${normal}`);
      if (mode === "apply") {
        const name = process.env.PRODUCT_NAME ?? "";
        if (!name) throw new Error("PRODUCT_NAME is required");
        const made = await prisma.$transaction((tx) => registerIntegration(tx, { kind: "system", ref: "go-live-register-product" }, { key, name, baseUrl: normal }));
        if (!made) {
          console.log(`ALREADY REGISTERED: ${key} exists, nothing changed and no secrets are shown again (rotation is a separate step). Run with REGISTER_PRODUCT=check.`);
        } else {
          console.log("REGISTERED. Put these two lines in the product's env file now; they are not shown again:");
          console.log(`PLATFORM_COMMAND_SECRETS=${made.outbound}`);
          console.log(`PLATFORM_ANSWER_SECRET=${made.inbound}`);
        }
        return;
      }
      const found = await getIntegration(prisma, key);
      if (!found) throw new Error(`CHECK FAILED: ${key} is not registered`);
      if (found.baseUrl !== normal) throw new Error(`CHECK FAILED: ${key} is registered at ${found.baseUrl}, not ${normal}`);
      if (found.status !== "current") throw new Error(`CHECK FAILED: ${key} is ${found.status}, not current`);
      for (const direction of ["outbound", "inbound"] as const) {
        const secrets = await getSecrets(prisma, key, direction).catch(() => null);
        if (!secrets?.current) throw new Error(`CHECK FAILED: the ${direction} secret cannot be read with the current PLATFORM_SECRETS_KEY`);
      }
      console.log(`CHECK OK: ${key} is current at ${found.baseUrl}; both secrets can be read with this key.`);
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);
});
