import { ProductDetailView } from "@/components/account/product-detail";
import { requireAccountSignIn } from "@/lib/account/guard";

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  await requireAccountSignIn(`/products/${encodeURIComponent(key)}`);
  return <ProductDetailView productKey={key} />;
}
