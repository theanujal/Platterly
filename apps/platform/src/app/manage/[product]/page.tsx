import Link from "next/link";
import { StoreFrame } from "@/components/store/frame";
import { ManageFlow } from "@/components/store/manage-flow";
import { getSession } from "@/lib/session";
import { requireStoreSignIn } from "@/lib/store/guard";
import { StoreUnavailable } from "@/components/store/unavailable";
import { fetchOpsBillingProfile } from "@/modules/store/ops-catalogue";
import { loadStoreProducts } from "@/modules/store/products";
import "@/components/store/store.css";

export default async function ManagePage({ params }: { params: Promise<{ product: string }> }) {
  const key = (await params).product;
  await requireStoreSignIn(`/manage/${encodeURIComponent(key)}`);
  const data = await loadStoreProducts(await getSession());
  if (data.source === "unavailable") return <StoreFrame><StoreUnavailable /></StoreFrame>;
  if (data.source === "ops" && data.business.state !== "ok") {
    return (
      <StoreFrame>
        <main className="ps-page ps-manage">
          <h1>Set up your business first</h1>
          <p>{data.business.state === "none" ? "You have not set up a business yet. Create it in your Account, then come back to choose a plan." : "Your access to your business has ended, so you cannot change its plan."}</p>
          <p><Link href="/">Back to Store</Link></p>
        </main>
      </StoreFrame>
    );
  }
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
  // The business's saved billing details start the form filled in (live Store only; the business was already checked to be the person's own, as its Admin).
  // Ops being unreachable or having nothing saved just leaves the form blank, as before.
  const saved = data.source === "ops" && data.business.state === "ok" ? await fetchOpsBillingProfile(data.business.id) : null;
  const savedBuyer = saved?.ok ? saved.answer.profile : null;
  return (
    <StoreFrame>
      <ManageFlow product={product} live={data.source === "ops"} savedBuyer={savedBuyer} />
    </StoreFrame>
  );
}
