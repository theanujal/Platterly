import { ShoppingCart } from "lucide-react";
import { Badge, Button, Empty, PageHeader, formatWhen } from "@/components/ui";
import { RETENTION_DAYS, listAbandonedOrders } from "@/modules/abandoned-orders/abandoned-orders";
import { markFollowedUpAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Abandoned orders" };

const STEP = { verified: "Verified the email", opened_store: "Opened the Store", payment_started: "Started the payment", payment_failed: "Payment failed" } as const;

export default async function AbandonedOrdersPage() {
  const rows = await listAbandonedOrders();
  return (
    <>
      <PageHeader title="Abandoned orders" description={`People who chose a paid plan and never paid. Their sign-in records are gone and their email can sign up again. Kept ${RETENTION_DAYS} days for follow-up.`} />
      {rows.length === 0 ? (
        <Empty><ShoppingCart className="mx-auto mb-2 size-5" aria-hidden />No abandoned orders.</Empty>
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-card shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{r.name} <span className="font-normal text-muted-foreground">{r.email}{r.phone ? ` · ${r.phone}` : ""}</span></p>
                  <Badge tone={r.status === "OPEN" ? "warning" : "success"}>{r.status === "OPEN" ? "Open" : "Followed up"}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {r.productKey}{r.planCode ? ` · ${r.planCode}` : ""}{r.interval ? ` · ${r.interval === "ANNUAL" ? "yearly" : "monthly"}` : ""} · {STEP[r.step as keyof typeof STEP] ?? r.step}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Signed up {formatWhen(r.signedUpAt)} · abandoned {formatWhen(r.abandonedAt)}</p>
              </div>
              {r.status === "OPEN" ? <form action={markFollowedUpAction}><input type="hidden" name="id" value={r.id} /><Button type="submit" variant="outline" size="md">Mark as followed up</Button></form> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
