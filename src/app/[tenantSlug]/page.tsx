import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UtensilsCrossed, Phone, Mail, Globe } from "lucide-react";
import { getPublishedTenantBySlug } from "@/modules/tenants/tenant";
import { listStorefrontMenus } from "@/modules/menus/menu";
import { canonicalUrl } from "@/lib/seo/canonical";
import { buildRestaurantJsonLd } from "@/lib/seo/structured-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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

  const title = `${organization.name} — Menu`;
  const description = organization.businessDescription?.trim() || `View ${organization.name}'s menu on Platterly.`;
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

// Chunk 8 Group 8.3 — the always-on, ungated public storefront. No auth, no
// approval gate, server-rendered so it's crawlable. Distinct from Chunk 11's
// per-event Menu Selection workflow (that one's approval-gated).
export default async function TenantStorefrontPage({ params }: StorefrontPageProps) {
  const { tenantSlug } = await params;
  const organization = await getPublishedTenantBySlug(tenantSlug);
  if (!organization) notFound();

  const menus = await listStorefrontMenus(organization.id);
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
    menuItems: menus.flatMap((menu) => menu.sections.flatMap((section) => section.items)).map((item) => ({
      name: item.name,
      description: item.description ?? undefined,
      price: item.price,
    })),
  });

  const address = formatAddress(organization);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 md:px-8">
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

      {menus.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">This menu isn&apos;t published yet — check back soon.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {menus.map((menu) => (
            <section key={menu.id} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{menu.name}</h2>
                  <Badge variant={menu.menuType === "VEGETARIAN" ? "default" : "outline"}>
                    {menu.menuType === "VEGETARIAN" ? "Veg" : "Non-Veg"}
                  </Badge>
                </div>
                {menu.description && <p className="text-sm text-muted-foreground">{menu.description}</p>}
                <p className="text-sm font-medium">₹{menu.pricePerPlate.toFixed(2)} / plate</p>
              </div>

              {menu.sections.map((section) => (
                <div key={section.categoryId ?? "other"} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{section.categoryName}</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {section.items.map((item) => (
                      <Card key={item.id} className="overflow-hidden py-0">
                        <CardContent className="flex items-center gap-3 p-3">
                          {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image} alt="" className="size-14 shrink-0 rounded-md object-cover" />
                          ) : (
                            <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted">
                              <UtensilsCrossed className="size-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex flex-1 flex-col gap-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{item.name}</span>
                              <Badge variant={item.foodType === "VEGETARIAN" ? "default" : "outline"} className="shrink-0">
                                {item.foodType === "VEGETARIAN" ? "Veg" : "Non-Veg"}
                              </Badge>
                            </div>
                            {item.description && <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
