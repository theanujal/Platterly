import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { resolveQuotationToken, getQuotation, markQuotationViewed, isQuotationPastValidity } from "@/modules/quotations/quotation";
import { Badge } from "@/components/ui/badge";
import { PublicShell } from "@/components/public/public-shell";
import { buildApprovalView } from "@/modules/menu-approvals/approval-view";
import { buildQuotationSnapshot } from "@/modules/quotations/quotation-snapshot";
import { QuotationReview } from "./_components/quotation-review";
import type { QuotationStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Quotation — Caterly",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  CHANGES_REQUESTED: "Changes Requested",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

// Kept in sync with the same legend in (app)/quotations/page.tsx (AJ,
// 2026-09-19) — a status should read identically wherever it appears.
const STATUS_VARIANT: Record<QuotationStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "info",
  VIEWED: "info",
  CHANGES_REQUESTED: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
};

const ACTIONABLE_STATUSES: QuotationStatus[] = ["SENT", "VIEWED"];

export default async function PublicQuotationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveQuotationToken(token);

  if (!resolved) {
    return (
      <PublicShell brand={{ name: "Platterly", logo: null }} width="max-w-xl">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12">
          <h1 className="text-2xl font-semibold">This link is no longer valid</h1>
          <p className="text-sm text-muted-foreground">It may have been revoked or expired. Ask your caterer to resend it.</p>
        </div>
      </PublicShell>
    );
  }

  // First customer view: Sent -> Viewed. Safe to call unconditionally — a no-op past that status.
  await markQuotationViewed(resolved.organizationId, resolved.quotationId);

  const [quotation, organization] = await Promise.all([
    getQuotation(resolved.organizationId, resolved.quotationId),
    prisma.organization.findUniqueOrThrow({ where: { id: resolved.organizationId } }),
  ]);
  if (!quotation) {
    return (
      <PublicShell brand={{ name: organization.name, logo: organization.logo }} width="max-w-xl">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12">
          <h1 className="text-2xl font-semibold">This quotation is no longer available</h1>
        </div>
      </PublicShell>
    );
  }

  const isExpiredByDate = isQuotationPastValidity(quotation.validUntil);
  const view = buildApprovalView(await buildQuotationSnapshot(resolved.organizationId, quotation));
  const validUntil = quotation.validUntil ? quotation.validUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
  const statusMessage =
    quotation.status === "ACCEPTED"
      ? "You've accepted this quotation. Your caterer will follow up shortly."
      : quotation.status === "REJECTED"
        ? "You've declined this quotation."
        : quotation.status === "CHANGES_REQUESTED"
          ? "You've requested changes — your caterer will send an updated quotation."
          : quotation.status === "EXPIRED"
            ? "This quotation has expired."
            : null;

  return (
    <PublicShell brand={{ name: organization.name, logo: organization.logo }} title="Your Quotation" subtitle={`Quotation for ${quotation.customer.name}`} width="max-w-6xl">
      <div className="flex justify-center">
        <Badge variant={STATUS_VARIANT[quotation.status]}>{STATUS_LABEL[quotation.status]}</Badge>
      </div>
      <QuotationReview
        token={token}
        view={view}
        validUntil={validUntil}
        pastValidity={isExpiredByDate}
        terms={quotation.terms}
        actionable={ACTIONABLE_STATUSES.includes(quotation.status)}
        statusMessage={statusMessage}
      />
    </PublicShell>
  );
}
