import { BusinessBillingDetailView } from "@/components/account/business-billing";
import { requireAccountSignIn } from "@/lib/account/guard";

export default async function Page({ params }: { params: Promise<{ productKey: string }> }) {
  const { productKey } = await params;
  await requireAccountSignIn(`/billing-details/${encodeURIComponent(productKey)}`);
  return <BusinessBillingDetailView productKey={productKey} />;
}
