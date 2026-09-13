import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getInvoiceTermsAction } from "../actions";
import { InvoiceTermsForm } from "./_components/invoice-terms-form";

export const metadata: Metadata = {
  title: "Invoice Settings — Platterly",
  robots: { index: false, follow: false },
};

export default async function InvoiceSettingsPage() {
  const { organizationId } = await requireActiveOrganization();
  const terms = await getInvoiceTermsAction(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Invoice Settings</h1>
        <p className="text-sm text-muted-foreground">Terms &amp; conditions shown on your invoices.</p>
      </div>
      <InvoiceTermsForm initialTerms={terms} />
    </div>
  );
}
