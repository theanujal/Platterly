import type { Metadata } from "next";
import { Download } from "lucide-react";
import { resolveToken } from "@/lib/secure-access/token";
import { getInvoiceForCustomer } from "@/modules/invoices/invoice";
import { longDate } from "@/modules/invoices/invoice-format";
import { buildInvoiceDocument } from "@/modules/invoices/invoice-document";
import { PublicShell } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { InvoicePaper } from "../../(app)/invoices/_components/invoice-paper";

export const metadata: Metadata = {
  title: "Invoice — Platterly",
  robots: { index: false, follow: false },
};

// The customer's no-login view of an invoice or receipt, through its secure link (Chunk 2.4's token service).
export default async function CustomerInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  const data = resolved && resolved.resourceType === "INVOICE" ? await getInvoiceForCustomer(resolved.organizationId, resolved.resourceId) : null;

  if (!resolved || !data) {
    return (
      <PublicShell brand={{ name: "Platterly", logo: null }} width="max-w-xl">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12">
          <h1 className="text-2xl font-semibold">This link is no longer active</h1>
          <p className="text-sm text-muted-foreground">Please contact your caterer and they can send you a new one.</p>
        </div>
      </PublicShell>
    );
  }

  const { invoice, paid } = data;
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: resolved.organizationId }, select: { name: true, logo: true } });
  const isReceipt = invoice.type === "RECEIPT";
  return (
    <PublicShell
      brand={{ name: organization.name, logo: organization.logo }}
      title={isReceipt ? "Your Receipt" : "Your Invoice"}
      subtitle={isReceipt ? "Thank you. We have received your payment." : `${invoice.number} · issued ${longDate(invoice.issueDate)}`}
      width="max-w-3xl"
    >
      <InvoicePaper doc={buildInvoiceDocument(invoice, paid)} />
      <div className="flex justify-end">
        <Button render={<a href={`/invoice/${token}/pdf`} download />} nativeButton={false}>
          <Download />
          Download PDF
        </Button>
      </div>
    </PublicShell>
  );
}
