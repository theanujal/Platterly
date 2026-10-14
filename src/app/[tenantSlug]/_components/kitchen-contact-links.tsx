import Link from "next/link";
import { Globe, Mail, MessageCircle, Phone } from "lucide-react";
import { formatPhoneDisplay, whatsappDigits } from "@/lib/phone";

interface KitchenContactLinksProps {
  tenantSlug: string;
  organization: { name: string; contactPhone: string | null; contactEmail: string | null; websiteUrl: string | null };
}

/**
 * How to reach the kitchen, as tappable links (AJ, 2026-10-14): call, WhatsApp, email, website, and back to the kitchen's
 * home. Shown on the "request submitted" and "link expired" screens, where the customer may need to get in touch.
 */
export function KitchenContactLinks({ tenantSlug, organization }: KitchenContactLinksProps) {
  const link = "inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted";
  return (
    <div className="flex flex-col items-center gap-3" data-testid="kitchen-contact">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {organization.contactPhone && (
          <a href={`tel:+${whatsappDigits(organization.contactPhone)}`} className={link}>
            <Phone className="size-4" /> Call {formatPhoneDisplay(organization.contactPhone)}
          </a>
        )}
        {organization.contactPhone && (
          <a href={`https://wa.me/${whatsappDigits(organization.contactPhone)}`} target="_blank" rel="noopener" className={link}>
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        )}
        {organization.contactEmail && (
          <a href={`mailto:${organization.contactEmail}`} className={link}>
            <Mail className="size-4" /> {organization.contactEmail}
          </a>
        )}
        {organization.websiteUrl && (
          <a href={organization.websiteUrl} target="_blank" rel="noopener" className={link}>
            <Globe className="size-4" /> Website
          </a>
        )}
      </div>
      <Link href={`/${tenantSlug}`} className="text-sm font-medium text-primary hover:underline">
        Back to {organization.name} home
      </Link>
    </div>
  );
}
