import { headers } from "next/headers";
import { requireAccountSignIn } from "@/lib/account/guard";
import { OverviewView } from "@/components/account/views";
import { getSession } from "@/lib/session";
import { requireStoreSignIn } from "@/lib/store/guard";
import { StoreFrame } from "@/components/store/frame";
import { StoreHome } from "@/components/store/home";
import { loadStoreProducts } from "@/modules/store/products";
import { StoreUnavailable } from "@/components/store/unavailable";
import { hostKind, originFor, requestHost } from "@/lib/routing/hosts";

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
    const data = await loadStoreProducts(await getSession());
    return <StoreFrame>{data.source === "unavailable" ? <StoreUnavailable /> : <StoreHome products={data.products} bundles={data.bundles} live={data.source === "ops"} business={data.source === "ops" ? data.business : null} billing={data.source === "ops" ? data.billing : "ok"} />}</StoreFrame>;
  }
  return <main>Platterly {kind}</main>;
}
