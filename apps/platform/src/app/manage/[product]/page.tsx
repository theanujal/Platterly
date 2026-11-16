import { prisma } from "@/lib/db";
import { getIntegration } from "@/modules/integrations/registry";
import { originFor } from "@/lib/routing/hosts";
import Link from "next/link";
import { StoreFrame } from "@/components/store/frame";
import { ManageFlow, type InitialChoice } from "@/components/store/manage-flow";
import { getSession } from "@/lib/session";
import { requireStoreSignIn } from "@/lib/store/guard";
import { StoreUnavailable } from "@/components/store/unavailable";
import { fetchOpsProductBillingProfiles } from "@/modules/store/ops-catalogue";
import { pendingBuyerFor } from "@/modules/store/pending-buyer";
import { opsKeyFor } from "@/modules/store/keys";
import { buyerFromProfile } from "@/modules/store/profile-ready";
import { SAMPLE_BILLING_PROFILE } from "@/modules/store/sample-catalogue";
import { loadStoreProducts } from "@/modules/store/products";
import { loadAccountProductCards } from "@/modules/account/product-cards";
import "@/components/store/store.css";

export default async function ManagePage({ params, searchParams }: { params: Promise<{ product: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const key = (await params).product;
  const query = (await searchParams) ?? {};
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // A paid-plan sign-up arrives with the plan it chose (the link was signed by the identity provider at sign-up, and the Store re-checks every price with Ops anyway).
  const planCode = one(query.plan);
  const interval = one(query.interval);
  const initialChoice: InitialChoice | null = planCode && /^[a-z0-9_-]{1,60}$/.test(planCode) && (interval === "MONTHLY" || interval === "ANNUAL") ? { planCode, interval } : null;
  const keep = initialChoice ? `?plan=${encodeURIComponent(initialChoice.planCode)}&interval=${initialChoice.interval}` : "";
  await requireStoreSignIn(`/manage/${encodeURIComponent(key)}${keep}`);
  const data = await loadStoreProducts(await getSession());
  if (data.source === "unavailable") return <StoreFrame><StoreUnavailable /></StoreFrame>;
  if (data.source === "ops" && data.business.state !== "ok") {
    return (
      <StoreFrame>
        <main className="ps-page ps-manage">
          <h1>{data.business.state === "not_admin" ? "Only your business's Admin can change the plan" : "Set up your business first"}</h1>
          <p>{data.business.state === "none" ? "You have not set up a business yet. Create it in your Account, then come back to choose a plan." : data.business.state === "not_admin" ? "Plans and payments for your business are managed by its Admin. Ask them to make the change." : "Your access to your business has ended, so you cannot change its plan."}</p>
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
  // A paid-plan sign-up that has not paid has no business yet, so no product profile can exist: the form still takes the details once, for its first invoice.
  // Everyone else sees the product's saved billing profile from Ops (edited in the Account), and the Store never collects a second copy.
  const session = await getSession();
  const collectDetails = data.source === "ops" && data.business.state === "ok" ? Boolean(await pendingBuyerFor(session)) : false;
  const saved = collectDetails && data.source === "ops" && data.business.state === "ok" ? await fetchOpsProductBillingProfiles(data.business.id) : null;
  const savedProfile = saved?.ok ? saved.profiles.find((p) => p.productKey === opsKeyFor(key)) ?? null : null;
  const savedBuyer = savedProfile ? buyerFromProfile(savedProfile) : null;
  let profile = data.source === "ops" ? null : SAMPLE_BILLING_PROFILE;
  let profileState: "ok" | "unavailable" = "ok";
  if (data.source === "ops" && data.business.state === "ok" && !collectDetails) {
    const list = await fetchOpsProductBillingProfiles(data.business.id);
    if (list.ok) profile = list.profiles.find((p) => p.productKey === opsKeyFor(key)) ?? null;
    else if (list.reason !== "not_found") profileState = "unavailable";
  }
  // After paying, a paid-plan sign-up goes on to the product's own sign-in (already signed in, so no form), which lands in its onboarding.
  const integration = initialChoice ? await getIntegration(prisma, key).catch(() => null) : null;
  const continueUrl = integration ? `${integration.baseUrl}/api/platform/sso/start` : null;
  const cards = await loadAccountProductCards();
  const hasLogo = cards.status === "ok" && Boolean(cards.cards.find((c) => c.accountKey === key)?.logoUrl);
  return (
    <StoreFrame>
      <ManageFlow product={product} hasLogo={hasLogo} profile={profile} profileState={profileState} collectDetails={collectDetails} editUrl={`${originFor("account")}/billing-details/${encodeURIComponent(opsKeyFor(key))}`} live={data.source === "ops"} savedBuyer={savedBuyer} accountUrl={originFor("account")} initialChoice={initialChoice} continueUrl={continueUrl} />
    </StoreFrame>
  );
}
