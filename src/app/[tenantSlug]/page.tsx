import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UtensilsCrossed, Phone, Mail, Globe } from "lucide-react";
import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { listEventTypes } from "@/modules/events/event-type";
import { canonicalUrl } from "@/lib/seo/canonical";
import { buildRestaurantJsonLd } from "@/lib/seo/structured-data";
import { EventDetailsForm } from "./_components/event-details-form";

interface StorefrontPageProps {
  params: Promise<{ tenantSlug: string }>;
}

function formatAddress(org: { addressLine1: string | null; city: string | null; state: string | null }) {
  return [org.addressLine1, org.city, org.state].filter(Boolean).join(", ");
}

export async function generateMetadata({ params }: StorefrontPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) return {};

  const title = `Plan Your Event — ${organization.name}`;
  const description = organization.businessDescription?.trim() || `Plan your event with ${organization.name} on Platterly.`;
  const url = canonicalUrl(`/${organization.slug}`);
  const image = organization.logo ? canonicalUrl(organization.logo) : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
  };
}

// Chunk 8 Group 8.3 + Chunk 11 Group 11.2 (revised 2026-09-18, AJ) — the
// tenant-wide Public Menu Link now opens straight into the event-details
// intake form, no separate /eventdetails step and no browsable menu/item
// listing here (that's inside Menu Selection, after this form is submitted).
export default async function TenantStorefrontPage({ params }: StorefrontPageProps) {
  const { tenantSlug } = await params;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) notFound();

  const eventTypes = (await listEventTypes(organization.id)).filter((et) => et.isActive);

  const url = canonicalUrl(`/${organization.slug}`);
  const jsonLd = buildRestaurantJsonLd({
    name: organization.name,
    description: organization.businessDescription,
    url,
    image: organization.logo ? canonicalUrl(organization.logo) : undefined,
    telephone: organization.contactPhone,
    address: {
      streetAddress: organization.addressLine1,
      addressLocality: organization.city,
      addressRegion: organization.state,
      postalCode: organization.postalCode,
      addressCountry: organization.country,
    },
    menuItems: [],
  });

  const address = formatAddress(organization);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 md:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="flex flex-col items-center gap-3 text-center">
        {organization.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={organization.logo} alt={organization.name} className="h-16 w-auto" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-full bg-muted">
            <UtensilsCrossed className="size-7 text-muted-foreground" />
          </div>
        )}
        <h1 className="text-2xl font-semibold">{organization.name}</h1>
        {organization.businessDescription && (
          <p className="max-w-lg text-sm text-muted-foreground">{organization.businessDescription}</p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {address && <span>{address}</span>}
          {organization.contactPhone && (
            <span className="flex items-center gap-1">
              <Phone className="size-3" />
              {organization.contactPhone}
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
      </header>

      <div className="flex flex-col gap-1 text-center">
        <h2 className="text-xl font-semibold">Plan Your Event</h2>
        <p className="text-sm text-muted-foreground">Tell us about your special occasion</p>
      </div>

      <EventDetailsForm tenantSlug={tenantSlug} eventTypes={eventTypes.map((et) => ({ id: et.id, name: et.name }))} />
    </main>
  );
}
