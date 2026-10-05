import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";

/**
 * Ops staff sign in here and nowhere else; these accounts are separate from every product's logins (AJ, 2026-10-05).
 * There is no sign-up: staff are created by `npm run ops:create-staff`.
 */
function trustedOrigins(): string[] {
  const extra = (process.env.OPS_TRUSTED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [process.env.BETTER_AUTH_URL ?? "http://ops.localhost:3200", ...extra];
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: trustedOrigins(),
  advanced: {
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: [nextCookies()],
});
