import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { AuthLayout } from "@/app/kitchenlogin/_components/auth-layout";
import { AuthGate } from "@/app/kitchenlogin/_components/auth-gate";
import { SignOutButton } from "@/app/kitchenlogin/_components/sign-out-button";
import { AcceptButton } from "./_components/accept-button";

export const metadata: Metadata = {
  title: "Join your team — Platterly",
  robots: { index: false, follow: false },
};

/**
 * Chunk 5 Group 5.2 — public preview (no `requireSession`): better-auth's
 * own `getInvitation`/`acceptInvitation` both require a session whose email
 * already matches the invitation, so a visitor who isn't signed in yet
 * couldn't even preview what they're being invited to via those endpoints.
 * Reads the invitation directly instead, then branches on the current
 * session state.
 */
export default async function AcceptInvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invitation = await prisma.invitation.findUnique({
    where: { id },
    include: { organization: true },
  });

  const isValid = invitation && invitation.status === "pending" && invitation.expiresAt > new Date();

  if (!invitation || !isValid) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-semibold">This invitation is no longer valid</h1>
          <p className="text-sm text-muted-foreground">
            It may have already been used, cancelled, or expired. Ask whoever invited you to send a new one.
          </p>
        </div>
      </main>
    );
  }

  const session = await auth.api.getSession({ headers: await nextHeaders() });
  const callbackURL = `/invitations/${id}/accept`;

  if (!session) {
    return (
      <AuthLayout>
        <AuthGate initialMode="signup" callbackURL={callbackURL} lockedEmail={invitation.email} />
      </AuthLayout>
    );
  }

  if (!session.user.emailVerified) {
    redirect(`/kitchenlogin/verify-email?next=${encodeURIComponent(callbackURL)}`);
  }

  if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <h1 className="text-xl font-semibold">Wrong account</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;re signed in as {session.user.email}, but this invitation was sent to {invitation.email}. Sign
            out and sign in with the invited email to accept it.
          </p>
          <SignOutButton />
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold">Join {invitation.organization.name}</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;ve been invited as <span className="font-medium capitalize">{invitation.role}</span>.
        </p>
        <AcceptButton invitationId={invitation.id} />
      </div>
    </main>
  );
}
