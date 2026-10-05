import { requireSuperAdminOrRedirect } from "../../_lib/guard";
import { getPlatformBillingProfile } from "@/modules/subscriptions/platform-billing";
import { formatInvoiceNumber } from "@/modules/subscriptions/invoice-number";
import { ManagedInOps } from "../_components/managed-in-ops";
import { PageHeader } from "../_components/page-header";
import { BillingProfileForm } from "./_components/billing-profile-form";

// Chunk 20: Platterly's own details, printed as the seller on every plan invoice.
export default async function BillingDetailsPage() {
  await requireSuperAdminOrRedirect();
  const profile = await getPlatformBillingProfile();
  return (
    <>
      <ManagedInOps what="Billing details" />
      <PageHeader
        crumbs={[{ label: "Platform" }, { label: "Billing details" }]}
        title="Billing details"
        description="Platterly's own details, printed as the seller on every plan invoice. Every field can be filled in later; a blank one is left off the invoice."
      />
      <BillingProfileForm
        example={formatInvoiceNumber(profile.invoicePrefix, "ABC Caterer", new Date(), 1)}
        initial={{
          legalName: profile.legalName ?? "",
          addressLine1: profile.addressLine1 ?? "",
          addressLine2: profile.addressLine2 ?? "",
          city: profile.city ?? "",
          state: profile.state ?? "",
          stateCode: profile.stateCode ?? "",
          postalCode: profile.postalCode ?? "",
          country: profile.country ?? "",
          gstin: profile.gstin ?? "",
          pan: profile.pan ?? "",
          sacCode: profile.sacCode,
          invoicePrefix: profile.invoicePrefix,
          email: profile.email ?? "",
          phone: profile.phone ?? "",
          website: profile.website ?? "",
          invoiceNote: profile.invoiceNote ?? "",
        }}
      />
    </>
  );
}
