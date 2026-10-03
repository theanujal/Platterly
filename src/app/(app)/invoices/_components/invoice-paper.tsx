import { inr, longDate } from "@/modules/invoices/invoice-format";
import { cn } from "cn";

export interface PaperInvoice {
  type: "INVOICE" | "RECEIPT";
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  businessName: string;
  businessAddress: string | null;
  businessGstNumber: string | null;
  gstEnabled: boolean;
  gstType: "CGST_SGST" | "IGST";
  gstRate: unknown;
  taxableValue: unknown;
  cgst: unknown;
  sgst: unknown;
  igst: unknown;
  total: unknown;
  terms: string | null;
  notes: string | null;
  items: { id: string; description: string; detail: string | null; hsnSac: string | null; quantity: unknown; rate: unknown; amount: unknown }[];
  eventLabel?: string | null;
}

function Party({ label, name, lines, align }: { label: string; name: string; lines: (string | null)[]; align?: "right" }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", align === "right" && "sm:text-right")}>
      <span className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="font-semibold">{name}</span>
      {lines.filter(Boolean).map((line) => (
        <span key={line} className="text-sm text-muted-foreground">
          {line}
        </span>
      ))}
    </div>
  );
}

/** The invoice or receipt as a paper card: the same layout on the admin page, the customer's link and (as a PDF) in a download. */
export function InvoicePaper({ invoice }: { invoice: PaperInvoice }) {
  const half = Number(invoice.gstRate) / 2;
  return (
    <div className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10 md:p-6" data-testid="invoice-paper">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Party label="From" name={invoice.businessName} lines={[invoice.businessAddress, invoice.businessGstNumber ? `GSTIN ${invoice.businessGstNumber}` : null]} />
        <Party label="Billed to" name={invoice.customerName} lines={[invoice.customerAddress, invoice.customerPhone]} align="right" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Party label={invoice.type === "RECEIPT" ? "Receipt" : "Invoice"} name={invoice.number} lines={[]} />
        <Party label="Issued" name={longDate(invoice.issueDate)} lines={[]} />
        {invoice.type === "INVOICE" && <Party label="Due" name={invoice.dueDate ? longDate(invoice.dueDate) : "On receipt"} lines={[]} />}
        {invoice.eventLabel && <Party label="Event" name={invoice.eventLabel} lines={[]} />}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-2.5">Item</th>
              {invoice.gstEnabled && <th className="px-3 py-2.5">HSN/SAC</th>}
              <th className="px-3 py-2.5 text-right">Qty</th>
              <th className="px-3 py-2.5 text-right">Rate</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-t border-border align-top">
                <td className="px-3 py-2.5">
                  <span className="block font-medium">{item.description}</span>
                  {item.detail && <span className="block text-xs text-muted-foreground">{item.detail}</span>}
                </td>
                {invoice.gstEnabled && <td className="px-3 py-2.5 text-muted-foreground">{item.hsnSac}</td>}
                <td className="px-3 py-2.5 text-right">{Number(item.quantity).toLocaleString("en-IN")}</td>
                <td className="px-3 py-2.5 text-right">{inr(item.rate)}</td>
                <td className="px-3 py-2.5 text-right">{inr(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto flex w-full max-w-xs flex-col gap-2 text-sm tabular-nums">
        {invoice.gstEnabled && (
          <>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Taxable value</span>
              <span>{inr(invoice.taxableValue)}</span>
            </div>
            {invoice.gstType === "IGST" ? (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">IGST {Number(invoice.gstRate)}%</span>
                <span>{inr(invoice.igst)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">CGST {half}%</span>
                  <span>{inr(invoice.cgst)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">SGST {half}%</span>
                  <span>{inr(invoice.sgst)}</span>
                </div>
              </>
            )}
          </>
        )}
        <div className="flex justify-between gap-3 rounded-lg bg-accent px-4 py-3 font-semibold text-accent-foreground">
          <span>Total</span>
          <span className="text-lg" data-testid="invoice-total">
            {inr(invoice.total)}
          </span>
        </div>
        {invoice.gstEnabled && <span className="text-right text-xs text-muted-foreground">Prices include GST.</span>}
      </div>

      {invoice.notes && <p className="text-sm text-muted-foreground">{invoice.notes}</p>}
      {invoice.terms && (
        <div className="border-t border-dashed border-border pt-4 text-sm" data-testid="invoice-terms">
          <p className="mb-1 font-semibold">Terms &amp; Conditions</p>
          <p className="whitespace-pre-line text-muted-foreground">{invoice.terms}</p>
        </div>
      )}
    </div>
  );
}
