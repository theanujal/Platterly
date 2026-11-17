import type { Metadata } from "next";
import { Building2, Globe, Hash, MapPin, Phone, Receipt, Store } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { profileLinkOn, refreshOwnProfile } from "@/modules/ops-link/billing-profile";
import { EditablePanel } from "../../../_components/editable-panel";
import { Detail, DetailGrid, SettingsCard, SettingsSection } from "../../../_components/settings-ui";
import { BillingProfileForm, BusinessProfileForm } from "./_components/business-profile-form";

export const metadata: Metadata = {
  title: "Caterly Profile — Caterly",
  robots: { index: false, follow: false },
};

type Shared = { name?: string | null; brandName?: string | null; contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null };

/** The same two cards as the Account's Business & Billing page: the Business Profile and the Billing Profile, each with its own Edit. */
export default async function BusinessProfilePage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  // The shared fields live in the business's billing profile in Platterly Ops: refresh the copy first so this page never shows something an Account edit already changed.
  const ref = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { businessId: true } });
  await refreshOwnProfile(organizationId, ref.businessId);
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { billingProfile: { select: { version: true, profile: true } } } });
  const shared = organization.billingProfile?.profile as unknown as Shared | undefined;
  const linked = profileLinkOn();
  const version = organization.billingProfile ? String(organization.billingProfile.version) : "";
  const businessName = organization.name === "Unnamed Business" ? "" : organization.name;
  const nextOrderNumber = `${organization.orderNumberPrefix}-${String(organization.orderNumberNextValue).padStart(organization.orderNumberPadding, "0")}`;
  const street = [organization.addressLine1, organization.addressLine2].filter(Boolean).join(", ");

  return (
    <SettingsCard title="Caterly Profile" description="Keep your business and billing profile up to date. Changes stay in sync with your Platterly Account.">
      <div className="flex flex-col gap-6">
        <EditablePanel
          editLabel="Edit Profile"
          heading={
            <div className="flex items-center gap-3">
              {organization.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploads are plain /uploads files, or the logo link kept in Platterly Ops
                <img src={organization.logo} alt="" className="size-14 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Building2 className="size-6" />
                </span>
              )}
              <div>
                <h2 className="text-lg font-semibold">Business Profile</h2>
                <p className="text-xs text-muted-foreground">Information used to identify and represent your business in Caterly.</p>
              </div>
            </div>
          }
          view={
            <>
              <SettingsSection icon={Store} title="Basic Information">
                <DetailGrid>
                  {linked && <Detail label="Brand Name" value={shared?.brandName} />}
                  <Detail label="Business Description" value={organization.businessDescription} className="sm:col-span-2" />
                </DetailGrid>
              </SettingsSection>

              <SettingsSection icon={Phone} title="Contact Information">
                <DetailGrid>
                  <Detail label="Mobile Number" value={organization.contactPhone} />
                </DetailGrid>
              </SettingsSection>

              <SettingsSection icon={Globe} title="Online Presence">
                <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                  <Detail label="Website URL" value={organization.websiteUrl} />
                  <Detail label="Instagram" value={organization.instagramUrl} />
                  <Detail label="Facebook" value={organization.facebookUrl} />
                  <Detail label="LinkedIn" value={organization.linkedinUrl} />
                </div>
              </SettingsSection>

              <SettingsSection icon={Hash} title="Order Numbering">
                <DetailGrid>
                  <Detail label="Prefix" value={organization.orderNumberPrefix} />
                  <Detail label="Starting Number" value={String(organization.orderNumberNextValue)} />
                  <Detail label="Digits" value={String(organization.orderNumberPadding)} />
                  <Detail label="Next Order Number" value={nextOrderNumber} />
                </DetailGrid>
              </SettingsSection>
            </>
          }
          edit={
            <BusinessProfileForm
              key={`business-${version}`}
              initialValues={{
                brandName: shared?.brandName ?? "",
                showBrand: linked,
                profileVersion: version,
                businessDescription: organization.businessDescription ?? "",
                mobileNumber: organization.contactPhone ?? "",
                websiteUrl: organization.websiteUrl ?? "",
                instagramUrl: organization.instagramUrl ?? "",
                facebookUrl: organization.facebookUrl ?? "",
                linkedinUrl: organization.linkedinUrl ?? "",
                logoUrl: organization.logo,
                orderNumberPrefix: organization.orderNumberPrefix,
                orderNumberNextValue: String(organization.orderNumberNextValue),
                orderNumberPadding: String(organization.orderNumberPadding),
              }}
            />
          }
        />

        <EditablePanel
          editLabel="Edit Billing"
          heading={
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Receipt className="size-6" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Billing Profile</h2>
                <p className="text-xs text-muted-foreground">The business name, tax number, address and billing contact used for subscriptions and invoices. Changes apply to future invoices only.</p>
              </div>
            </div>
          }
          view={
            <>
              <SettingsSection icon={Receipt} title="Business & Tax">
                <DetailGrid>
                  <Detail label="Business Name" value={businessName || "No business name yet"} />
                  <Detail label="GSTIN" value={organization.gstNumber} />
                </DetailGrid>
              </SettingsSection>

              <SettingsSection icon={MapPin} title="Billing Address">
                <DetailGrid>
                  <Detail label="Street Address" value={street} className="sm:col-span-2" />
                  <Detail label="City" value={organization.city} />
                  <Detail label="State" value={organization.state} />
                  <Detail label="ZIP Code" value={organization.postalCode} />
                  <Detail label="Country" value={organization.country} />
                </DetailGrid>
              </SettingsSection>

              {linked && (
                <SettingsSection icon={Phone} title="Billing Contact">
                  <DetailGrid>
                    <Detail label="Billing Contact" value={shared?.contactName} />
                    <Detail label="Billing Email" value={shared?.contactEmail} />
                    <Detail label="Billing Phone" value={shared?.contactPhone} />
                  </DetailGrid>
                </SettingsSection>
              )}
            </>
          }
          edit={
            <BillingProfileForm
              key={`billing-${version}`}
              initialValues={{
                showShared: linked,
                profileVersion: version,
                businessName,
                gstin: organization.gstNumber ?? "",
                billingContactName: shared?.contactName ?? "",
                billingEmail: shared?.contactEmail ?? "",
                billingPhone: shared?.contactPhone ?? "",
                addressLine1: organization.addressLine1 ?? "",
                addressLine2: organization.addressLine2 ?? "",
                city: organization.city ?? "",
                state: organization.state ?? "",
                postalCode: organization.postalCode ?? "",
                country: organization.country ?? "",
              }}
            />
          }
        />
      </div>
    </SettingsCard>
  );
}
