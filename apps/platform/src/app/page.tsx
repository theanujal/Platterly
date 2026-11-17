import { headers } from "next/headers";
import { requireAccountSignIn } from "@/lib/account/guard";
import { OverviewView } from "@/components/account/views";
import { getSession } from "@/lib/session";
import { requireStoreSignIn } from "@/lib/store/guard";
import { StoreFrame } from "@/components/store/frame";
import { StoreHome } from "@/components/store/home";
import { loadStoreProducts } from "@/modules/store/products";
import { loadAccountProductCards } from "@/modules/account/product-cards";
import { StoreUnavailable } from "@/components/store/unavailable";
import { hostKind, originFor, requestHost } from "@/lib/routing/hosts";

/** The Account's Overview is titled (written out in full: a layout's title template does not reach the page of its own segment); the Store's home keeps the plain "Platterly Store". */
export async function generateMetadata() {
  return hostKind(requestHost(await headers())) === "account" ? { title: { absolute: "Overview · Platterly Account" } } : {};
}

/**
 * The account host shows the Account overview (real data) and the store host shows the Store home (a prototype with sample
 * data). The auth host stays a placeholder that names the surface that answered; its real pages arrive in later phases.
 */
export default async function Home() {
  const kind = hostKind(requestHost(await headers()));
  if (kind === "account") {
    await requireAccountSignIn("/");
    return <OverviewView storeOrigin={originFor("store")} />;
  }
  if (kind === "store") {
    await requireStoreSignIn("/");
    const [data, cards] = await Promise.all([loadStoreProducts(await getSession()), loadAccountProductCards()]);
    return <StoreFrame>{data.source === "unavailable" ? <StoreUnavailable /> : <StoreHome products={data.products} bundles={data.bundles} cards={cards.status === "ok" ? cards.cards : []} accountOrigin={originFor("account")} live={data.source === "ops"} business={data.source === "ops" ? data.business : null} billing={data.source === "ops" ? data.billing : "ok"} />}</StoreFrame>;
  }
  return <main>Platterly {kind}</main>;
}
