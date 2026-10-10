import { CalendarDays, MapPin, UtensilsCrossed, Users, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { inr, longDate } from "@/modules/invoices/invoice-format";
import type { InvoiceDocument } from "@/modules/invoices/invoice-document";
import { cn } from "cn";

/** One section of the bill: a grey title bar over its content, like the sample (AJ, 2026-10-10). */
function Section({ title, description, children, className, testId }: { title: string; description?: string; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-border", className)} data-testid={testId}>
      <div className="border-b border-border bg-muted/60 px-4 py-2.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 text-sm">
      <dt className="font-medium text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function EventCell({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-base font-medium">{value}</span>
      </span>
    </div>
  );
}

/**
 * The invoice or receipt as a paper card, laid out like the sample bill: the business and invoice number on top, invoice
 * and customer information, the event, the menu with its dishes by category, the charges, the payment summary, notes, the
 * total, and "Powered by Platterly" at the foot. The same document feeds the PDF.
 */
export function InvoicePaper({ doc }: { doc: InvoiceDocument }) {
  const half = doc.gst.rate / 2;
  const eventDate = doc.event.start.toDateString() === doc.event.end.toDateString() ? longDate(doc.event.start) : `${longDate(doc.event.start)} – ${longDate(doc.event.end)}`;

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 md:p-8" data-testid="invoice-paper">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{doc.business.name}</h1>
          <p className="mt-1 text-xs tracking-[0.25em] text-muted-foreground uppercase">Catering Services</p>
          {doc.business.address && <p className="mt-2 text-sm text-muted-foreground">{doc.business.address}</p>}
          {doc.business.gstNumber && <p className="text-sm text-muted-foreground">GSTIN {doc.business.gstNumber}</p>}
        </div>
        <div className="border-l border-border pl-5">
          <p className="text-3xl font-bold tracking-tight">{doc.title}</p>
          <dl className="mt-1 flex flex-col gap-0.5 text-sm">
            <div className="flex gap-3">
              <dt className="text-muted-foreground">{doc.type === "RECEIPT" ? "Receipt #:" : "Invoice #:"}</dt>
              <dd className="font-medium" data-testid="invoice-number">{doc.number}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="text-muted-foreground">Date:</dt>
              <dd className="font-medium">{longDate(doc.issueDate)}</dd>
            </div>
            {doc.type === "INVOICE" && (
              <div className="flex gap-3">
                <dt className="text-muted-foreground">Due Date:</dt>
                <dd className="font-medium">{doc.dueDate ? longDate(doc.dueDate) : "On receipt"}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section title={doc.type === "RECEIPT" ? "Receipt Information" : "Invoice Information"}>
          <dl className="flex flex-col gap-2.5 p-4">
            <Row label="Order ID">{doc.orderNumber ?? "—"}</Row>
            <Row label="Status">
              <Badge variant={doc.status.tone} className="px-3 py-1 font-semibold" data-testid="invoice-status">
                {doc.status.label}
              </Badge>
            </Row>
          </dl>
        </Section>
        <Section title="Customer Information">
          <dl className="flex flex-col gap-2.5 p-4">
            <Row label="Name">{doc.customer.name}</Row>
            {doc.customer.phone && <Row label="Phone">{doc.customer.phone}</Row>}
            <Row label="Address">{doc.customer.address ?? "—"}</Row>
          </dl>
        </Section>
      </div>

      <Section title="Event Details">
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <EventCell icon={CalendarDays} label="Event Type" value={doc.event.type ?? "—"} />
          <EventCell icon={CalendarDays} label="Event Date" value={eventDate} />
          <EventCell icon={Users} label="Guests" value={doc.event.guests !== null ? String(doc.event.guests) : "—"} />
        </div>
        {doc.event.venue && (
          <div className="border-t border-border">
            <EventCell icon={MapPin} label="Venue" value={doc.event.venue} />
          </div>
        )}
      </Section>

      {doc.menu && (
        <Section title="Selected Menu & Food Items" description="Below are the categories and items selected for this event." testId="invoice-menu">
          <div className="flex flex-col gap-3 p-3">
            {doc.menu.name && (
              <div className="flex items-center gap-4 rounded-lg border border-primary/30 bg-primary/10 p-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <UtensilsCrossed className="size-6" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs font-bold tracking-wide text-primary uppercase">Main Menu</span>
                  <span className="text-lg font-semibold">{doc.menu.name}</span>
                </span>
              </div>
            )}
            <div className="columns-1 gap-3 sm:columns-2">
              {doc.menu.groups.map((group) => (
                <div key={group.name} className="mb-3 break-inside-avoid overflow-hidden rounded-lg border border-border">
                  <p className="border-b border-border bg-muted/60 px-3 py-2 text-sm font-semibold">{group.name}</p>
                  <ul className="flex flex-col gap-1.5 px-4 py-3 text-sm">
                    {group.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      <Section title="Charges">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-2.5">Item</th>
                {doc.gst.enabled && <th className="px-3 py-2.5">HSN/SAC</th>}
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="px-3 py-2.5 text-right">Rate</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {doc.charges.map((item) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-4 py-2.5">
                    <span className="block font-medium">{item.description}</span>
                    {item.detail && <span className="block text-xs text-muted-foreground">{item.detail}</span>}
                  </td>
                  {doc.gst.enabled && <td className="px-3 py-2.5 text-muted-foreground">{item.hsnSac}</td>}
                  <td className="px-3 py-2.5 text-right">{item.quantity.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2.5 text-right">{inr(item.rate)}</td>
                  <td className="px-4 py-2.5 text-right">{inr(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Payment Summary" testId="invoice-payment-summary">
        <div className="flex flex-col gap-2 p-4 text-sm tabular-nums">
          {doc.summary.map((row) =>
            row.kind === "balance" ? (
              <div key={row.label} className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-success/10 px-3 py-2.5 font-semibold text-success" data-testid="invoice-balance">
                <span>{row.label}</span>
                <span className="text-lg">{inr(row.value)}</span>
              </div>
            ) : (
              <div key={row.label} className="flex justify-between gap-3">
                <span className="font-medium text-muted-foreground">{row.label}</span>
                <span>{row.kind === "discount" ? `− ${inr(row.value)}` : inr(row.value)}</span>
              </div>
            ),
          )}
          {doc.gst.enabled && (
            <div className="mt-2 flex flex-col gap-1.5 border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
              <div className="flex justify-between gap-3">
                <span>Taxable value</span>
                <span>{inr(doc.gst.taxableValue)}</span>
              </div>
              {doc.gst.type === "IGST" ? (
                <div className="flex justify-between gap-3">
                  <span>IGST {doc.gst.rate}%</span>
                  <span>{inr(doc.gst.igst)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between gap-3">
                    <span>CGST {half}%</span>
                    <span>{inr(doc.gst.cgst)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>SGST {half}%</span>
                    <span>{inr(doc.gst.sgst)}</span>
                  </div>
                </>
              )}
              <span className="text-right">Prices include GST.</span>
            </div>
          )}
        </div>
      </Section>

      {doc.notes && (
        <Section title="Notes">
          <p className="m-3 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">{doc.notes}</p>
        </Section>
      )}

      {doc.terms && (
        <Section title="Terms & Conditions" testId="invoice-terms">
          <p className="px-4 py-3 text-sm whitespace-pre-line text-muted-foreground">{doc.terms}</p>
        </Section>
      )}

      <div className="flex items-center justify-between gap-4 border-t-2 border-foreground pt-3">
        <span className="text-2xl font-bold">Total Amount:</span>
        <span className="text-3xl font-bold text-success" data-testid="invoice-total">
          {inr(doc.total)}
        </span>
      </div>

      <footer className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground" data-testid="invoice-powered-by">
        {/* eslint-disable-next-line @next/next/no-img-element -- the Platterly mark, a static asset */}
        <img src="/platterly-mark.svg" alt="" className="size-4" />
        Powered by <span className="font-semibold text-primary">Platterly</span>
      </footer>
    </div>
  );
}
