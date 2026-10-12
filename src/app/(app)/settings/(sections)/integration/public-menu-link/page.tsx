import type { Metadata } from "next";
import { Download, ExternalLink } from "lucide-react";
import { hasPermission, requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { canonicalUrl, withSrc } from "@/lib/seo/canonical";
import { generateQrCodeDataUrl } from "@/lib/secure-access/qr";
import { slugify } from "@/modules/tenants/slug";
import { Button, buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { InfoBox, InfoList, SettingsCard, SettingsPanel, SettingsSection } from "../../../_components/settings-ui";
import { PublicMenuLinkForm } from "./_components/public-menu-link-form";
import { OrderStandSection } from "./_components/order-stand-section";
import { getStandPageData } from "@/modules/stand/stand-orders";

export const metadata: Metadata = {
  title: "Platterly Link — Caterly",
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
  const qrDataUrl = claimed ? await generateQrCodeDataUrl(withSrc(url, "qr")) : null;
  const locked = claimed && organization.slugChangeCount >= CHANGE_LIMIT;
  const [stand, canOrderStand] = await Promise.all([getStandPageData(organizationId), hasPermission({ tenant: ["edit"] }, organizationId)]);
  // The QR on the printed stand is the direct link, with no ?src= tag.
  const standQr = stand.linkUrl ? await generateQrCodeDataUrl(stand.linkUrl) : null;

  return (
    <SettingsCard
      title="Platterly Link"
      description={claimed ? "Your unique Platterly link for customers to place orders." : "Set up your unique Platterly link for customers to place orders."}
    >
      {/* Two columns from the large breakpoint (AJ, 2026-10-12): the link on the left, the Order QR stand on the right. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <SettingsPanel>
        <InfoBox tone="info">
          <p>Share this unique link with customers. They can browse your menu and place orders directly through this URL.</p>
        </InfoBox>

        {claimed && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_minmax(0,1fr)]" data-testid="link-qr-row">
            {qrDataUrl && (
              <div className="flex flex-col items-start gap-3 rounded-lg bg-muted/50 p-4">
                <p className="text-xs font-medium text-muted-foreground">QR code</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Scan to view your public menu" className="size-28 rounded border border-border bg-white" />
              </div>
            )}
            <div className="flex min-w-0 flex-col justify-between gap-3 rounded-lg bg-muted/50 p-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Your Business URL</p>
                <p className="mt-1 font-mono text-sm break-all">{url}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <CopyButton value={url} iconOnly size="md" />
                <Button variant="outline" size="md" className="w-[38px] px-0" aria-label="Open link" render={<a href={url} target="_blank" rel="noopener" />} nativeButton={false}>
                  <ExternalLink />
                </Button>
                {qrDataUrl && (
                  <a href={qrDataUrl} download={`${organization.slug}-menu-qr.png`} className={buttonVariants({ variant: "outline", size: "md" })}>
                    <Download />
                    Download QR code
                  </a>
                )}
              </div>
            </div>
          </div>
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
              printedStands={stand.orders.length > 0}
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
        {claimed && (
          <SettingsSection title="Know where visitors come from" description="Reports > Storefront shows the source of every visit. Google, other websites and frames are detected on their own. For the rest, add one of these tags to the end of your link.">
            <ul className="flex flex-col gap-1.5 text-sm" data-testid="src-tags">
              {[
                ["QR code", "?src=qr", "already added to the QR above"],
                ["WhatsApp", "?src=whatsapp", "already added to the Share on WhatsApp button"],
                ["Instagram bio or story", "?src=instagram", ""],
                ["Facebook page or post", "?src=facebook", ""],
                ["Email or newsletter", "?src=email", ""],
                ["Anything else, e.g. a flyer", "?src=flyer", "any short word of letters and numbers"],
              ].map(([where, tag, note]) => (
                <li key={tag} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-1.5">
                  <span>{where}</span>
                  <span className="flex items-baseline gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{tag}</code>
                    {note && <span className="text-xs text-muted-foreground">{note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </SettingsSection>
        )}

      </SettingsPanel>
      <SettingsPanel>
        <OrderStandSection
          unavailable={stand.unavailable}
          offer={stand.offer}
          orders={stand.orders}
          linkUrl={stand.linkUrl}
          kitchenName={stand.kitchenName}
          kitchenLogo={stand.kitchenLogo}
          qr={standQr}
          shipTo={stand.shipTo}
          canOrder={canOrderStand}
        />
      </SettingsPanel>
      </div>
    </SettingsCard>
  );
}
