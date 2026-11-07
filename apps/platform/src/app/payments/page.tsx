import { PaymentsView } from "@/components/account/billing-views";
import { requireAccountSignIn } from "@/lib/account/guard";

export default async function Page() {
  await requireAccountSignIn("/payments");
  return <PaymentsView />;
}
