import { AccountShell } from "@/components/account/shell";
import { BillingDetails } from "@/components/account/billing-details";
import { PageHeader } from "@/components/account/ui";
import { requireAccountSignIn } from "@/lib/account/guard";

export default async function Page() {
  await requireAccountSignIn("/billing-details");
  return (
    <AccountShell>
      <PageHeader title="Billing Details" lede="Manage your business and billing information. These details are used for invoices and official communication." />
      <BillingDetails />
    </AccountShell>
  );
}
