import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { canonicalUrl } from "@/lib/seo/canonical";
import { PublicMenuLinkForm } from "./_components/public-menu-link-form";

export const metadata: Metadata = {
  title: "Public Menu Link — Platterly",
  robots: { index: false, follow: false },
};

export default async function PublicMenuLinkPage() {
  const { organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Public Menu Link</h1>
        <p className="text-sm text-muted-foreground">
          Your menu&apos;s public link — share it with customers, or generate a QR code (coming soon).
        </p>
      </div>
      <p className="text-sm">
        Current link:{" "}
        <a href={canonicalUrl(`/${organization.slug}`)} target="_blank" rel="noopener" className="font-medium text-primary hover:underline">
          {canonicalUrl(`/${organization.slug}`)}
        </a>
      </p>
      <PublicMenuLinkForm currentSlug={organization.slug} slugChangeCount={organization.slugChangeCount} />
    </div>
  );
}
