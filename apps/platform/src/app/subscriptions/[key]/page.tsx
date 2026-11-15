import { SubscriptionDetailsView } from "@/components/account/subscription-details";
import { requireAccountSignIn } from "@/lib/account/guard";
import { originFor } from "@/lib/routing/hosts";

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  await requireAccountSignIn(`/subscriptions/${encodeURIComponent(key)}`);
  return <SubscriptionDetailsView productKey={key} storeOrigin={originFor("store")} />;
}
