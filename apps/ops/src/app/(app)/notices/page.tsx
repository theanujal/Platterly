import { prisma } from "@/lib/db";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { getNotice, noticeDelivery } from "@/modules/notices/notices";
import { NoticeForm } from "./notice-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sidebar notice" };

export default async function NoticesPage() {
  const products = await prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
  const rows = await Promise.all(products.map(async (p) => ({ product: p, notice: await getNotice(p.key), delivery: await noticeDelivery(p.key) })));
  return (
    <>
      <PageHeader title="Sidebar notice" description="A short message with an optional button, shown in every business's sidebar for a product." />
      {rows.length === 0 ? <Empty>No products registered yet.</Empty> : null}
      <div className="grid gap-8">
        {rows.map(({ product, notice, delivery }) => (
          <div key={product.key} className="grid gap-3">
            <NoticeForm productKey={product.key} productName={product.name} values={{ enabled: notice?.enabled ?? false, title: notice?.title ?? "", message: notice?.message ?? "", buttonLabel: notice?.buttonLabel ?? "", buttonUrl: notice?.buttonUrl ?? "" }} />
            {delivery ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                Delivery of the current notice:
                <Badge tone="success">{delivery.sent} delivered</Badge>
                {delivery.pending ? <Badge tone="warning">{delivery.pending} waiting</Badge> : null}
                {delivery.failed ? <Badge tone="danger">{delivery.failed} failed</Badge> : null}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
