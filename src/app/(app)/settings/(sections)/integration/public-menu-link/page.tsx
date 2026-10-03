import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { canonicalUrl } from "@/lib/seo/canonical";
import { generateQrCodeDataUrl } from "@/lib/secure-access/qr";
import { slugify } from "@/modules/tenants/slug";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { InfoBox, InfoList, SettingsCard, SettingsPanel, SettingsSection } from "../../../_components/settings-ui";
import { PublicMenuLinkForm } from "./_components/public-menu-link-form";

export const metadata: Metadata = {
  title: "Platterly Link — Platterly",
  robots: { index: false, follow: false },
};

// Same free-change allowance as PublicMenuLinkForm and setCustomSlugAction.
const CHANGE_LIMIT = 2;

// Laid out like AJ's "Platterly Link" reference (2026-09-30): share note, the
// business URL with copy/open, the locked notice once changes run out, and how it works.
export default async function PublicMenuLinkPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const claimed = organization.slugChangeCount > 0;
  const url = canonicalUrl(`/${organization.slug}`);
  const qrDataUrl = claimed ? await generateQrCodeDataUrl(url) : null;
  const locked = claimed && organization.slugChangeCount >= CHANGE_LIMIT;

  return (
    <SettingsCard
      title="Platterly Link"
      description={claimed ? "Your unique Platterly link for customers to place orders." : "Set up your unique Platterly link for customers to place orders."}
    >
      <SettingsPanel>
        <InfoBox tone="info">
          <p>Share this unique link with customers. They can browse your menu and place orders directly through this URL.</p>
        </InfoBox>

        {claimed && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Your Business URL</p>
                <p className="mt-1 font-mono text-sm break-all">{url}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <CopyButton value={url} iconOnly size="md" />
                <Button variant="outline" size="md" aria-label="Open link" render={<a href={url} target="_blank" rel="noopener" />} nativeButton={false}>
                  <ExternalLink />
                </Button>
              </div>
            </div>
            {qrDataUrl && (
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Scan to view your public menu" className="size-28 rounded border border-border" />
                <a href={qrDataUrl} download={`${organization.slug}-menu-qr.png`} className="text-sm font-medium text-primary hover:underline">
                  Download QR code
                </a>
              </div>
            )}
          </>
        )}

        {locked ? (
          <InfoBox tone="warning" title="Business URL is locked">
            <p>Your Business URL has been set and can not be changed by you. If you need to change it, please contact the Platterly Team.</p>
          </InfoBox>
        ) : (
          <SettingsSection title={claimed ? "Change your link" : "Choose your link"}>
            <PublicMenuLinkForm
              currentSlug={organization.slug}
              slugChangeCount={organization.slugChangeCount}
              suggestedSlug={organization.name !== "Unnamed Business" ? slugify(organization.name) : undefined}
            />
          </SettingsSection>
        )}

        <SettingsSection title="How it works">
          <InfoList
            items={[
              "Customers visit your unique Business URL",
              "They browse your menu and select items",
              "Orders placed through this URL are automatically linked to your business",
              "You receive and manage orders in your admin dashboard",
            ]}
          />
        </SettingsSection>
      </SettingsPanel>
    </SettingsCard>
  );
}
