import { AccountShell } from "@/components/account/shell";
import { PaymentMethods } from "@/components/account/payment-methods";
import { PageHeader } from "@/components/account/ui";
import { requireAccountSignIn } from "@/lib/account/guard";

export default async function Page() {
  await requireAccountSignIn("/payment-methods");
  return (
    <AccountShell>
      <PageHeader title="Payment method" lede="The cards your subscriptions renew with. Monthly plans renew automatically from the primary method." />
      <PaymentMethods />
    </AccountShell>
  );
}
