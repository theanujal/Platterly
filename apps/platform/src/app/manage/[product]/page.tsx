import Link from "next/link";
import { StoreFrame } from "@/components/store/frame";
import { ManageFlow } from "@/components/store/manage-flow";
import { requireStoreHost } from "@/lib/store/guard";
import { StoreUnavailable } from "@/components/store/unavailable";
import { loadStoreProducts } from "@/modules/store/products";
import "@/components/store/store.css";

export default async function ManagePage({ params }: { params: Promise<{ product: string }> }) {
  await requireStoreHost();
  const key = (await params).product;
  const data = await loadStoreProducts();
  if (data.source === "unavailable") return <StoreFrame><StoreUnavailable /></StoreFrame>;
  const product = data.products.find((p) => p.key === key) ?? null;
  if (!product) {
    return (
      <StoreFrame>
        <main className="ps-page ps-manage">
          <h1>We could not find that product</h1>
          <p><Link href="/">Back to Store</Link></p>
        </main>
      </StoreFrame>
    );
  }
  return (
    <StoreFrame>
      <ManageFlow product={product} live={data.source === "ops"} />
    </StoreFrame>
  );
}
