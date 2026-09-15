import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { BusinessProfileForm } from "./_components/business-profile-form";

export const metadata: Metadata = {
  title: "Business Profile — Platterly",
  robots: { index: false, follow: false },
};

export default async function BusinessProfilePage() {
  const { organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Business Profile</h1>
        <p className="text-sm text-muted-foreground">Keep your business profile up to date.</p>
      </div>
      <BusinessProfileForm
        initialValues={{
          businessName: organization.name === "Unnamed Business" ? "" : organization.name,
          businessDescription: organization.businessDescription ?? "",
          addressLine1: organization.addressLine1 ?? "",
          city: organization.city ?? "",
          state: organization.state ?? "",
          postalCode: organization.postalCode ?? "",
          country: organization.country ?? "",
          mobileNumber: organization.contactPhone ?? "",
          gstNumber: organization.gstNumber ?? "",
          gstShowOnInvoices: organization.gstShowOnInvoices ?? false,
          websiteUrl: organization.websiteUrl ?? "",
          instagramUrl: organization.instagramUrl ?? "",
          facebookUrl: organization.facebookUrl ?? "",
          logoUrl: organization.logo,
          orderNumberPrefix: organization.orderNumberPrefix,
          orderNumberNextValue: String(organization.orderNumberNextValue),
          orderNumberPadding: String(organization.orderNumberPadding),
        }}
      />
    </div>
  );
}
