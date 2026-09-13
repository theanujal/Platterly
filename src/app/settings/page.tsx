import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { SettingsForm } from "./_components/settings-form";

export const metadata: Metadata = {
  title: "Settings — Platterly",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const { organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Business settings</h1>
        <p className="text-sm text-muted-foreground">Keep your business profile up to date.</p>
      </div>
      <SettingsForm
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
        }}
      />
    </main>
  );
}
