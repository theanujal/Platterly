import type { Metadata } from "next";
import { Building2, Globe, Hash, MapPin, Phone, Store } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { EditablePanel } from "../../../_components/editable-panel";
import { Detail, DetailGrid, SettingsCard, SettingsSection } from "../../../_components/settings-ui";
import { BusinessProfileForm } from "./_components/business-profile-form";

export const metadata: Metadata = {
  title: "Business Profile — Platterly",
  robots: { index: false, follow: false },
};

export default async function BusinessProfilePage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const businessName = organization.name === "Unnamed Business" ? "" : organization.name;
  const nextOrderNumber = `${organization.orderNumberPrefix}-${String(organization.orderNumberNextValue).padStart(organization.orderNumberPadding, "0")}`;

  return (
    <SettingsCard title="Business Profile" description="Keep your business profile up to date.">
      <EditablePanel
        editLabel="Edit Profile"
        heading={
          <div className="flex items-center gap-3">
        {organization.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploads are plain /uploads files, same as the rest of the app
          <img src={organization.logo} alt="" className="size-14 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Building2 className="size-6" />
          </span>
        )}
        <div>
          <p className="text-lg font-semibold">{businessName || "No business name yet"}</p>
          <p className="text-xs text-muted-foreground">Business Logo</p>
        </div>
      </div>
        }
        view={
          <>
            <SettingsSection icon={Store} title="Basic Information">
              <DetailGrid>
                <Detail label="Company Name" value={businessName} />
                <Detail label="Business Description" value={organization.businessDescription} />
              </DetailGrid>
            </SettingsSection>

            <SettingsSection icon={Phone} title="Contact Information">
              <DetailGrid>
                <Detail label="Mobile Number" value={organization.contactPhone} />
                <Detail
                  label="GST Number"
                  value={organization.gstNumber ? `${organization.gstNumber}${organization.gstShowOnInvoices ? " · shown on invoices" : ""}` : null}
                />
              </DetailGrid>
            </SettingsSection>

            <SettingsSection icon={MapPin} title="Business Address">
              <DetailGrid>
                <Detail label="Street Address" value={organization.addressLine1} className="sm:col-span-2" />
                <Detail label="City" value={organization.city} />
                <Detail label="State" value={organization.state} />
                <Detail label="ZIP Code" value={organization.postalCode} />
                <Detail label="Country" value={organization.country} />
              </DetailGrid>
            </SettingsSection>

            <SettingsSection icon={Globe} title="Online Presence">
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
                <Detail label="Website URL" value={organization.websiteUrl} />
                <Detail label="Instagram" value={organization.instagramUrl} />
                <Detail label="Facebook" value={organization.facebookUrl} />
              </div>
            </SettingsSection>

            <SettingsSection icon={Hash} title="Order Numbering">
              <DetailGrid>
                <Detail label="Next Order Number" value={nextOrderNumber} />
              </DetailGrid>
            </SettingsSection>
          </>
        }
        edit={
          <BusinessProfileForm
            initialValues={{
              businessName,
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
        }
      />
    </SettingsCard>
  );
}
