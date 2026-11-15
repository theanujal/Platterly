import { AccountShell } from "@/components/account/shell";
import { BusinessBillingList } from "@/components/account/business-billing";
import { PageHeader } from "@/components/account/ui";
import { requireAccountSignIn } from "@/lib/account/guard";

export default async function Page() {
  await requireAccountSignIn("/billing-details");
  return (
    <AccountShell>
      <PageHeader title="Business & Billing" lede="Manage business and billing information for each of your Platterly products. Changes stay in sync across Platterly Accounts and the respective product (e.g. Caterly)." />
      <BusinessBillingList />
    </AccountShell>
  );
}
