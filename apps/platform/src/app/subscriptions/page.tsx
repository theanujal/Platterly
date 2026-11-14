import { SubscriptionsView } from "@/components/account/billing-views";
import { requireAccountSignIn } from "@/lib/account/guard";
import { originFor } from "@/lib/routing/hosts";

export default async function Page() {
  await requireAccountSignIn("/subscriptions");
  return <SubscriptionsView storeOrigin={originFor("store")} />;
}
