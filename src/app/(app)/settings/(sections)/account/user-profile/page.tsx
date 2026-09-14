import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { UserProfileForm } from "./_components/user-profile-form";

export const metadata: Metadata = {
  title: "User Profile — Platterly",
  robots: { index: false, follow: false },
};

export default async function UserProfilePage() {
  const { session, organizationId } = await requireActiveOrganization();
  const member = await prisma.member.findFirstOrThrow({
    where: { userId: session.user.id, organizationId },
  });

  const [firstName, ...rest] = session.user.name.split(" ");
  const lastName = rest.join(" ");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">User Profile</h1>
        <p className="text-sm text-muted-foreground">Your personal account details.</p>
      </div>
      <UserProfileForm
        initialFirstName={firstName}
        initialLastName={lastName}
        email={session.user.email}
        role={member.role}
        createdAt={session.user.createdAt.toLocaleDateString()}
        updatedAt={session.user.updatedAt.toLocaleDateString()}
      />
    </div>
  );
}
