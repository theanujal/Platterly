import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { canonicalUrl } from "@/lib/seo/canonical";
import { generateQrCodeDataUrl } from "@/lib/secure-access/qr";
import { slugify } from "@/modules/tenants/slug";
import { PublicMenuLinkForm } from "./_components/public-menu-link-form";

export const metadata: Metadata = {
  title: "Public Menu Link — Platterly",
  robots: { index: false, follow: false },
};

export default async function PublicMenuLinkPage() {
  const { organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const claimed = organization.slugChangeCount > 0;
  const qrDataUrl = claimed ? await generateQrCodeDataUrl(canonicalUrl(`/${organization.slug}`)) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Public Menu Link</h1>
        <p className="text-sm text-muted-foreground">
          {claimed
            ? "Your menu's public link — share it with customers, or scan the QR code below."
            : "You haven't claimed your public link yet. Choose one below to make your menu shareable."}
        </p>
      </div>
      {claimed && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Current link:{" "}
            <a href={canonicalUrl(`/${organization.slug}`)} target="_blank" rel="noopener" className="font-medium text-primary hover:underline">
              {canonicalUrl(`/${organization.slug}`)}
            </a>
          </p>
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Scan to view your public menu" className="size-32 rounded border border-border" />
          )}
        </div>
      )}
      <PublicMenuLinkForm
        currentSlug={organization.slug}
        slugChangeCount={organization.slugChangeCount}
        suggestedSlug={organization.name !== "Unnamed Business" ? slugify(organization.name) : undefined}
      />
    </div>
  );
}
