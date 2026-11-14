import { Badge, Button, Empty, PageHeader, Table, formatWhen } from "@/components/ui";
import { prisma } from "@/lib/db";
import { listCoupons } from "@/modules/billing/coupons";
import { CouponForm } from "./coupon-form";
import { setCouponActiveAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coupons" };

const rupees = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export default async function CouponsPage() {
  const [coupons, products] = await Promise.all([listCoupons(), prisma.product.findMany({ select: { key: true, name: true }, orderBy: { name: "asc" } })]);
  const now = new Date();
  const names = new Map(products.map((p) => [p.key, p.name]));
  return (
    <>
      <PageHeader title="Coupons" description="A coupon takes a percentage or rupees off the first payment of a purchase, before GST. One coupon per order. Renewals charge the full price." />
      <div className="grid gap-6">
        <CouponForm products={products} />
        {coupons.length === 0 ? (
          <Empty>No coupons yet.</Empty>
        ) : (
          <Table head={["Code", "Discount", "Product", "Used", "Expires", "Status", ""]}>
            {coupons.map((c) => {
              const expired = !!c.expiresAt && c.expiresAt <= now;
              return (
                <tr key={c.id}>
                  <td className="font-semibold">{c.code}{c.note ? <span className="block text-xs font-normal text-muted-foreground">{c.note}</span> : null}</td>
                  <td>{c.kind === "PERCENT" ? `${c.value}%` : rupees(c.value)}</td>
                  <td>{c.productKey ? names.get(c.productKey) ?? c.productKey : "Any"}</td>
                  <td>{c.maxUses != null ? `${c.uses} of ${c.maxUses}` : `${c.uses}`}</td>
                  <td>{c.expiresAt ? formatWhen(c.expiresAt) : "Never"}</td>
                  <td><Badge tone={!c.active ? "neutral" : expired ? "danger" : "success"}>{!c.active ? "Paused" : expired ? "Expired" : "Active"}</Badge></td>
                  <td>
                    <form action={setCouponActiveAction}>
                      <input type="hidden" name="code" value={c.code} />
                      <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                      <Button type="submit" variant="outline" size="md">{c.active ? "Pause" : "Resume"}</Button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>
    </>
  );
}
