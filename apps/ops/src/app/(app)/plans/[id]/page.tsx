import { notFound } from "next/navigation";
import type { ProductManifest } from "@platterly/contract";
import { Badge, Button, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getPlan } from "@/modules/plans/plans";
import { signupTrialPlan } from "@/modules/subscriptions/subscriptions";
import { setPlanActiveAction } from "../actions";
import { PlanForm } from "../plan-form";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await getPlan(id);
  if (!plan) notFound();
  const manifest = plan.product.manifest as unknown as ProductManifest | null;
  const signupTrial = plan.isTrial ? await signupTrialPlan(plan.productKey) : null;
  return (
    <>
      <PageHeader
        title={plan.name}
        description={`${plan.product.name} · ${plan.code}`}
        actions={
          <>
            {plan.isFeatured ? <Badge tone="info">Featured</Badge> : null}
            <Badge tone={plan.isActive ? "success" : "neutral"}>{plan.isActive ? "Active" : "Retired"}</Badge>
            <form action={setPlanActiveAction}>
              <input type="hidden" name="id" value={plan.id} />
              <input type="hidden" name="active" value={plan.isActive ? "0" : "1"} />
              <Button type="submit" variant="outline" size="md">{plan.isActive ? "Retire plan" : "Reactivate plan"}</Button>
            </form>
          </>
        }
      />
      {manifest ? (
        <PlanForm
          productKey={plan.productKey}
          productName={plan.product.name}
          defs={manifest.entitlements}
          otherFeatured={(await prisma.plan.findFirst({ where: { productKey: plan.productKey, isFeatured: true, id: { not: plan.id } }, select: { name: true } }))?.name ?? null}
          businessesOnPlan={await prisma.subscription.count({ where: { planId: plan.id, endDate: null } })}
          trialNote={!signupTrial ? null : signupTrial.id === plan.id ? "New businesses start on this trial plan." : `Only used when assigned by hand. New businesses start on ${signupTrial.name}, the oldest active trial plan.`}
          values={{
            id: plan.id,
            code: plan.code,
            name: plan.name,
            description: plan.description ?? "",
            isTrial: plan.isTrial,
            trialDurationDays: plan.trialDurationDays?.toString() ?? "",
            priceMonthly: plan.priceMonthly?.toString() ?? "",
            priceAnnual: plan.priceAnnual?.toString() ?? "",
            gstPercent: plan.gstPercent.toString(),
            highlights: plan.highlights.join("\n"),
            isFeatured: plan.isFeatured,
            isActive: plan.isActive,
            entitlements: (plan.entitlements ?? {}) as Record<string, number | boolean | string | null>,
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Read this product&apos;s manifest first (Products page), then edit its plans.</p>
      )}
    </>
  );
}
