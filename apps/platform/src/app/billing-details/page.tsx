import { AccountShell } from "@/components/account/shell";
import { BillingDetails } from "@/components/account/billing-details";
import { PageHeader } from "@/components/account/ui";
import { requireAccountSignIn } from "@/lib/account/guard";

export default async function Page() {
  await requireAccountSignIn("/billing-details");
  return (
    <AccountShell>
      <PageHeader title="Billing details" lede="The business name, address and GSTIN on your GST invoices. The Store fills them in for you at checkout." />
      <BillingDetails />
    </AccountShell>
  );
}
