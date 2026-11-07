import { InvoicesView } from "@/components/account/billing-views";
import { requireAccountSignIn } from "@/lib/account/guard";

export default async function Page() {
  await requireAccountSignIn("/invoices");
  return <InvoicesView />;
}
