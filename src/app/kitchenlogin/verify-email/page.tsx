import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { AuthLayout } from "../_components/auth-layout";
import { VerifyEmailForm } from "../_components/verify-email-form";

export const metadata: Metadata = {
  title: "Verify your email — Platterly",
  robots: { index: false, follow: false },
};

const DEFAULT_NEXT = "/kitchenlogin/onboarding";

/**
 * AJ's explicit ask (2026-09-16): every new sign-up (fresh caterer or an
 * invited teammate — both share `SignUpForm`) lands here before reaching
 * onboarding or the invitation-accept page, which redirect back here
 * themselves if a session isn't verified yet (see their own `emailVerified`
 * guards). `next` carries the original destination through, so verification
 * is an inserted step, never a change to where either flow already lands.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = next && next.startsWith("/") ? next : DEFAULT_NEXT;

  const session = await auth.api.getSession({ headers: await nextHeaders() });
  if (!session) {
    redirect("/kitchenlogin");
  }
  if (session.user.emailVerified) {
    redirect(destination);
  }

  return (
    <AuthLayout>
      <VerifyEmailForm email={session.user.email} next={destination} />
    </AuthLayout>
  );
}
