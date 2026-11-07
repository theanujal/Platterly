import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { AuthGate } from "./_components/auth-gate";
import { SsoProblem } from "./_components/sso-problem";
import { AuthLayout } from "./_components/auth-layout";
import { platformSsoEnabled } from "@/lib/platform/config";

// Chunk 4 — Caterer/Kitchen Admin sign-in and sign-up, served at the
// reserved `/kitchenlogin` path from Chunk 1 Group 1.4.
export const metadata: Metadata = {
  title: "Sign in — Caterly",
  robots: { index: false, follow: false },
};

export default async function KitchenAdminLoginPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth.api.getSession({ headers: await nextHeaders() });

  if (!session) {
    // Central single sign-in (PLATFORM_SSO=1): a person who is not signed in goes to Platterly's sign-in page, which looks like this one, and comes back
    // signed in. `?legacy=1` keeps the old email-and-password form reachable, and a failed attempt (`?error=`) shows why instead of looping.
    if (platformSsoEnabled()) {
      const query = (await searchParams) ?? {};
      if (query.legacy !== "1") {
        if (!query.error) redirect("/api/platform/sso/start");
        return (
          <AuthLayout>
            <SsoProblem code={String(Array.isArray(query.error) ? query.error[0] : query.error)} />
          </AuthLayout>
        );
      }
    }
    return (
      <AuthLayout>
        <AuthGate />
      </AuthLayout>
    );
  }

  // An Organization+Member always exist by the time a session exists (see
  // `databaseHooks.user.create.after` in `src/lib/auth/auth.ts`), so a
  // logged-in visit to /kitchenlogin always means "already set up" — the
  // wizard is only ever reached via the sign-up form's own post-success
  // redirect to /kitchenlogin/onboarding, never from here. This is what
  // makes onboarding genuinely one-time: closing the browser mid-wizard and
  // logging back in always lands on the Dashboard, never back at the wizard.
  redirect("/dashboard");
}
