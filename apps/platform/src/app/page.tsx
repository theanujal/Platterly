import { headers } from "next/headers";
import { requireAccountSignIn } from "@/lib/account/guard";
import { OverviewView } from "@/components/account/views";
import { StoreFrame } from "@/components/store/frame";
import { StoreHome } from "@/components/store/home";
import { loadStoreProducts } from "@/modules/store/products";
import { StoreUnavailable } from "@/components/store/unavailable";
import { hostKind, requestHost } from "@/lib/routing/hosts";

/**
 * The account host shows the Account overview (real data) and the store host shows the Store home (a prototype with sample
 * data). The auth host stays a placeholder that names the surface that answered; its real pages arrive in later phases.
 */
export default async function Home() {
  const kind = hostKind(requestHost(await headers()));
  if (kind === "account") {
    await requireAccountSignIn("/");
    return <OverviewView />;
  }
  if (kind === "store") {
    const data = await loadStoreProducts();
    return <StoreFrame>{data.source === "unavailable" ? <StoreUnavailable /> : <StoreHome products={data.products} bundles={data.bundles} live={data.source === "ops"} />}</StoreFrame>;
  }
  return <main>Platterly {kind}</main>;
}
