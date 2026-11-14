import { prisma } from "@/lib/db";
import { getIntegration } from "@/modules/integrations/registry";
import { originFor } from "@/lib/routing/hosts";
import Link from "next/link";
import { StoreFrame } from "@/components/store/frame";
import { ManageFlow, type InitialChoice } from "@/components/store/manage-flow";
import { getSession } from "@/lib/session";
import { requireStoreSignIn } from "@/lib/store/guard";
import { StoreUnavailable } from "@/components/store/unavailable";
import { fetchOpsBillingProfile } from "@/modules/store/ops-catalogue";
import { loadStoreProducts } from "@/modules/store/products";
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
  // After paying, a paid-plan sign-up goes on to the product's own sign-in (already signed in, so no form), which lands in its onboarding.
  const integration = initialChoice ? await getIntegration(prisma, key).catch(() => null) : null;
  const continueUrl = integration ? `${integration.baseUrl}/api/platform/sso/start` : null;
  return (
    <StoreFrame>
      <ManageFlow product={product} live={data.source === "ops"} savedBuyer={savedBuyer} accountUrl={originFor("account")} initialChoice={initialChoice} continueUrl={continueUrl} />
    </StoreFrame>
  );
}
