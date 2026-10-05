import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Empty, PageHeader, Table, formatWhen } from "@/components/ui";
import { formatInvoiceNumber } from "@/modules/billing/math";
import { getProfile } from "@/modules/billing/profile";
import { platformRazorpay } from "@/modules/billing/razorpay";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

const money = (value: unknown) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function BillingPage() {
  const [profile, payments, products] = await Promise.all([
    getProfile(),
    prisma.subscriptionPayment.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "desc" }, take: 50, include: { business: { select: { id: true, name: true } }, plan: { select: { name: true } }, product: { select: { name: true } } } }),
    prisma.product.findMany({ orderBy: { name: "asc" }, select: { key: true, name: true, invoicePrefix: true, invoiceCounter: { select: { lastNumber: true } } } }),
  ]);
  const numbering = products.map((p) => ({ key: p.key, name: p.name, issued: p.invoiceCounter?.lastNumber ?? 0, preview: formatInvoiceNumber(p.invoicePrefix ?? profile.invoicePrefix, "Example Business", new Date(), (p.invoiceCounter?.lastNumber ?? 0) + 1) }));
  const razorpay = platformRazorpay();

  return (
    <>
      <PageHeader title="Billing" description="What businesses pay Platterly, and the details printed on each invoice." actions={<Badge tone={razorpay ? "success" : "warning"}>{razorpay ? "Razorpay connected" : "Razorpay keys not set"}</Badge>} />
      <div className="mb-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ProfileForm
          numbering={numbering}
          values={{
            legalName: profile.legalName ?? "", addressLine1: profile.addressLine1 ?? "", addressLine2: profile.addressLine2 ?? "", city: profile.city ?? "", state: profile.state ?? "", stateCode: profile.stateCode ?? "",
            postalCode: profile.postalCode ?? "", country: profile.country ?? "", gstin: profile.gstin ?? "", pan: profile.pan ?? "", sacCode: profile.sacCode, invoicePrefix: profile.invoicePrefix,
            email: profile.email ?? "", phone: profile.phone ?? "", website: profile.website ?? "", invoiceNote: profile.invoiceNote ?? "",
          }}
        />
        <div className="text-sm text-muted-foreground">
          <p className="mb-2 font-semibold text-foreground">Online payment</p>
          <p>{razorpay ? "Platterly's Razorpay account is connected. Businesses can pay from their own billing screens." : "Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET in the ops environment to switch on online payment. Until then checkout answers \"not switched on yet\"."}</p>
          <p className="mt-3">Razorpay webhook URL: <span className="break-all font-mono text-xs text-foreground">/api/webhooks/razorpay</span> on the ops host, event <span className="font-mono text-xs">payment.captured</span> and <span className="font-mono text-xs">payment.failed</span>.</p>
          <p className="mt-3">Invoices issued so far: <span className="font-semibold text-foreground">{numbering.reduce((sum, n) => sum + n.issued, 0)}</span> across {numbering.length} product{numbering.length === 1 ? "" : "s"}.</p>
        </div>
      </div>

      <h2 className="mb-3 text-base font-semibold">Payments received</h2>
      {payments.length === 0 ? (
        <Empty>No payments yet.</Empty>
      ) : (
        <Table head={["Invoice", "Business", "Product and plan", "Total", "Paid"]}>
          {payments.map((p) => (
            <tr key={p.id}>
              <td><Link className="font-mono text-xs font-medium text-accent-foreground hover:underline" href={`/payments/${p.id}`}>{p.invoiceNumber ?? "—"}</Link></td>
              <td><Link className="hover:underline" href={`/businesses/${p.business.id}`}>{p.business.name}</Link></td>
              <td>{p.product.name} · {p.plan.name}<div className="text-xs text-muted-foreground">{p.interval === "ANNUAL" ? "1 year" : "30 days"}</div></td>
              <td>{money(p.total)}</td>
              <td>{formatWhen(p.paidAt)}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
