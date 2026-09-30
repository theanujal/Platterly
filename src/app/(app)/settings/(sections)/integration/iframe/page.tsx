import type { Metadata } from "next";
import Link from "next/link";
import { SettingsCard } from "../../../_components/settings-ui";
import { Button } from "@/components/ui/button";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { canonicalUrl } from "@/lib/seo/canonical";
import { IframeGenerator } from "./_components/iframe-generator";

export const metadata: Metadata = {
  title: "Iframe — Platterly",
  robots: { index: false, follow: false },
};

export default async function IframeSettingsPage() {
  const { organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { slug: true, slugChangeCount: true } });
  const claimed = organization.slugChangeCount > 0;

  return (
    <SettingsCard title="Iframe" description="Embed your public menu and ordering flow on your own website.">
      {claimed ? (
        <IframeGenerator url={canonicalUrl(`/${organization.slug}`)} />
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Claim your public menu link first — the iframe embeds that page.</p>
          <Button render={<Link href="/settings/integration/public-menu-link" />} nativeButton={false} variant="outline">
            Go to Public Menu Link
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}
