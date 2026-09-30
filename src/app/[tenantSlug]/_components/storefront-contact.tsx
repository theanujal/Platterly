import { Phone, Mail, Globe, MapPin } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/phone";

interface StorefrontContactProps {
  organization: {
    businessDescription: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    websiteUrl: string | null;
  };
}

/** The caterer's description and contact details, shown on the storefront's first screen only. */
export function StorefrontContact({ organization }: StorefrontContactProps) {
  const address = [organization.addressLine1, organization.city, organization.state].filter(Boolean).join(", ");
  const hasContact = address || organization.contactPhone || organization.contactEmail || organization.websiteUrl;
  if (!organization.businessDescription && !hasContact) return null;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {organization.businessDescription && <p className="max-w-xl text-sm text-muted-foreground">{organization.businessDescription}</p>}
      {hasContact && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {address && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {address}
            </span>
          )}
          {organization.contactPhone && (
            <span className="flex items-center gap-1">
              <Phone className="size-3" />
              {formatPhoneDisplay(organization.contactPhone)}
            </span>
          )}
          {organization.contactEmail && (
            <span className="flex items-center gap-1">
              <Mail className="size-3" />
              {organization.contactEmail}
            </span>
          )}
          {organization.websiteUrl && (
            <a href={organization.websiteUrl} target="_blank" rel="noopener" className="flex items-center gap-1 hover:underline">
              <Globe className="size-3" />
              Website
            </a>
          )}
        </div>
      )}
    </div>
  );
}
