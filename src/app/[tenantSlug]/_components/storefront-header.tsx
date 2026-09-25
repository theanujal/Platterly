import { UtensilsCrossed, Phone, Mail, Globe } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/phone";

interface StorefrontHeaderProps {
  organization: {
    name: string;
    logo: string | null;
    businessDescription: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    websiteUrl: string | null;
  };
  /** Wizard pages show just the logo and name; the storefront root shows the full contact block. */
  compact?: boolean;
}

export function StorefrontHeader({ organization, compact }: StorefrontHeaderProps) {
  const address = [organization.addressLine1, organization.city, organization.state].filter(Boolean).join(", ");
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      {organization.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={organization.logo} alt={organization.name} className={compact ? "h-10 w-auto" : "h-16 w-auto"} />
      ) : (
        <div className={compact ? "flex size-10 items-center justify-center rounded-full bg-muted" : "flex size-16 items-center justify-center rounded-full bg-muted"}>
          <UtensilsCrossed className={compact ? "size-5 text-muted-foreground" : "size-7 text-muted-foreground"} />
        </div>
      )}
      <h1 className={compact ? "text-lg font-semibold" : "text-2xl font-semibold"}>{organization.name}</h1>
      {!compact && organization.businessDescription && <p className="max-w-lg text-sm text-muted-foreground">{organization.businessDescription}</p>}
      {!compact && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {address && <span>{address}</span>}
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
    </header>
  );
}
