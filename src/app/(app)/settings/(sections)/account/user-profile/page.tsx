import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { roleLabel } from "@/lib/auth/role-metadata";
import { platformAccountOrigin } from "@/lib/platform/config";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Detail, DetailGrid, InfoBox, SettingsCard, SettingsPanel, SettingsSection } from "../../../_components/settings-ui";

export const metadata: Metadata = {
  title: "User Profile — Caterly",
  robots: { index: false, follow: false },
};

const formatDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/**
 * Read-only (AJ, 2026-11-10): a person's name, phone and email are kept in their Platterly Account and change only there; the Account sends every change
 * here (`person.profile`), so every product shows the same details. There is deliberately no edit form or server action in Caterly.
 */
export default async function UserProfilePage() {
  const { session, organizationId } = await requireActiveOrganization();
  const member = await prisma.member.findFirstOrThrow({
    where: { userId: session.user.id, organizationId },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { firstName: true, lastName: true, email: true, phone: true, createdAt: true } });
  const { firstName, lastName, email, phone } = user;
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  const initials = (`${(firstName ?? "").charAt(0)}${(lastName ?? "").charAt(0)}` || email.charAt(0)).toUpperCase();

  return (
    <SettingsCard title="User Profile" description="Your personal account details.">
      <SettingsPanel>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{name || "No name provided"}</p>
              <p className="break-all text-sm text-muted-foreground">{email}</p>
            </div>
          </div>
          <Badge variant="info">{roleLabel(member.role)}</Badge>
        </div>
        <InfoBox title="Managed in your Platterly Account">
          Your name, phone number and email are kept in your Platterly Account and change there, for every Platterly product at once.{" "}
          <a href={`${platformAccountOrigin()}/profile`} className="inline-flex items-center gap-1 font-medium underline">
            Open your Account <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </InfoBox>
        <SettingsSection title="Personal Information">
          <DetailGrid>
            <Detail label="First Name" value={firstName} />
            <Detail label="Last Name" value={lastName} />
            <Detail label="Phone Number" value={phone} />
            <Detail label="Email Address" value={email} />
          </DetailGrid>
        </SettingsSection>
        <SettingsSection title="Account Information">
          <DetailGrid>
            <Detail label="Account Role" value={roleLabel(member.role)} />
            <Detail label="Account Created" value={formatDate(user.createdAt)} />
          </DetailGrid>
        </SettingsSection>
      </SettingsPanel>
    </SettingsCard>
  );
}
