import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { EditablePanel } from "../../../_components/editable-panel";
import { InfoBox, InfoList, SettingsCard } from "../../../_components/settings-ui";
import { getInvoiceTermsAction } from "../actions";
import { InvoiceTermsForm } from "./_components/invoice-terms-form";

export const metadata: Metadata = {
  title: "Invoice Settings — Platterly",
  robots: { index: false, follow: false },
};

export default async function InvoiceSettingsPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ settings: ["view"] }, organizationId);
  const terms = await getInvoiceTermsAction();

  return (
    <SettingsCard title="Invoice Settings" description="Terms & conditions shown at the bottom of your invoices.">
      <EditablePanel
        editLabel="Edit Terms"
        heading={<h2 className="text-sm font-semibold">Current Terms and Conditions</h2>}
        view={
          <div className="flex flex-col gap-2">
            {terms.trim() ? (
              <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-line">{terms}</p>
            ) : (
              <p className="rounded-lg bg-muted/50 p-3 text-center text-sm text-muted-foreground">No custom terms and conditions set. Default invoice formatting will be used.</p>
            )}
          </div>
        }
        edit={<InvoiceTermsForm initialTerms={terms} />}
      />
      <InfoBox tone="info" title="Tips for Writing Terms and Conditions">
        <InfoList
          items={[
            "State payment due dates and accepted methods clearly.",
            "Mention any late-payment fees or your cancellation policy.",
            "Add your contact information for customer inquiries.",
            "Keep it concise — most customers skim this section.",
          ]}
        />
      </InfoBox>
      <InfoBox tone="success" title="Where Terms Appear">
        <p>Your terms and conditions will appear at the bottom of every invoice, including printed versions and PDF downloads, once invoicing is built.</p>
      </InfoBox>
    </SettingsCard>
  );
}
