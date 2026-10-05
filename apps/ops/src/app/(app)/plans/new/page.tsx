import { notFound } from "next/navigation";
import type { ProductManifest } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { PlanForm } from "../plan-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New plan" };

export default async function NewPlanPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product: key } = await searchParams;
  const product = key ? await prisma.product.findUnique({ where: { key } }) : null;
  const manifest = product?.manifest as unknown as ProductManifest | null;
  if (!product || !manifest) notFound();
  return (
    <>
      <PageHeader title="New plan" description={`For ${product.name}.`} />
      <PlanForm productKey={product.key} productName={product.name} defs={manifest.entitlements} values={{ code: "", name: "", description: "", isTrial: false, trialDurationDays: "", priceMonthly: "", priceAnnual: "", gstPercent: "18", highlights: "", entitlements: {} }} />
    </>
  );
}
