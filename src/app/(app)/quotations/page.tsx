import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listQuotations } from "@/modules/quotations/quotation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuotationsFilterBar } from "./_components/quotations-filter-bar";
import type { QuotationStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Quotations — Platterly",
  robots: { index: false, follow: false },
};

const STATUS_VARIANT: Record<QuotationStatus, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  SENT: "outline",
  VIEWED: "outline",
  CHANGES_REQUESTED: "destructive",
  ACCEPTED: "default",
  REJECTED: "destructive",
  EXPIRED: "secondary",
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

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

interface QuotationsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function QuotationsPage({ searchParams }: QuotationsPageProps) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["view"] }, organizationId);
  const { status } = await searchParams;
  const validStatus = status && status in STATUS_LABEL ? (status as QuotationStatus) : undefined;

  const quotations = await listQuotations(organizationId, { status: validStatus });

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Quotations</h1>
          <p className="text-sm text-muted-foreground">Send a priced proposal for a customer to approve digitally, before it becomes an Order.</p>
        </div>
        <Button size="sm" render={<Link href="/quotations/new" />} nativeButton={false}>
          <Plus className="size-4" />
          Create Quotation
        </Button>
      </div>

      <QuotationsFilterBar />

      {quotations.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No quotations yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quotations.map((quotation) => (
            <Link key={quotation.id} href={`/quotations/${quotation.id}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      <FileText className="size-4 text-muted-foreground" />
                      {quotation.customer.name}
                    </span>
                    <Badge variant={STATUS_VARIANT[quotation.status]}>{STATUS_LABEL[quotation.status]}</Badge>
                  </div>
                  {quotation.eventType && (
                    <Badge variant="outline" className="w-fit">
                      {quotation.eventType.name}
                    </Badge>
                  )}
                  <span className="text-sm font-semibold">{formatCurrency(Number(quotation.total))}</span>
                  {quotation.validUntil && (
                    <span className="text-xs text-muted-foreground">
                      Valid until {quotation.validUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
