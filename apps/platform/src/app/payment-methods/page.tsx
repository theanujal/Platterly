import { AccountShell } from "@/components/account/shell";
import { PaymentMethods } from "@/components/account/payment-methods";
import { PageHeader } from "@/components/account/ui";
import { requireAccountSignIn } from "@/lib/account/guard";

export const metadata = { title: "Payment Methods" };

export default async function Page() {
  await requireAccountSignIn("/payment-methods");
  return (
    <AccountShell>
      <PageHeader title="Payment Methods" lede="Manage the cards and payment methods used for your Platterly subscriptions." />
      <PaymentMethods />
    </AccountShell>
  );
}
