import Link from "next/link";
import { inr, longDate } from "@/modules/invoices/invoice-format";
import type { MenuReport } from "@/modules/reports/menu-math";
import type { MovementReport, PurchaseReport, StockReport } from "@/modules/reports/inventory-math";
import type { FinanceReport, PayablesReport, ReceivablesReport } from "@/modules/reports/finance-math";
import type { ChannelRow, StorefrontReport } from "@/modules/reports/storefront-math";
import type { RecentVisitor } from "@/modules/reports/more-reports";
import { BarList, ReportSection, ReportTile } from "./report-ui";

/** The Menu, Inventory, Finance and Storefront views (Chunk 22), shared by a kitchen's Reports page and the Super Admin platform report. */

const whole = (n: number) => n.toLocaleString("en-IN");
const qty = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const percent = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);
const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function Empty({ text = "Nothing in this period." }: { text?: string }) {
  return <p className="py-4 text-sm text-muted-foreground">{text}</p>;
}

type Align = "left" | "right";
function Table({ columns, rows, testId, min = "28rem" }: { columns: { label: string; align?: Align }[]; rows: React.ReactNode[][]; testId?: string; min?: string }) {
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <table className="w-full text-sm" style={{ minWidth: min }}>
        <thead>
          <tr className="text-left text-xs font-bold tracking-wider text-muted-foreground uppercase">
            {columns.map((c, i) => (
              <th key={c.label} className={`py-2 font-bold ${i < columns.length - 1 ? "pr-4" : ""} ${c.align === "right" ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-t border-border">
              {cells.map((cell, i) => (
                <td key={i} className={`py-2 ${i < cells.length - 1 ? "pr-4" : ""} ${columns[i].align === "right" ? "text-right tabular-nums" : ""} ${i === 0 ? "font-medium" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Menu

export function MenuView({ menu }: { menu: MenuReport }) {
  return (
    <div className="flex flex-col gap-4" data-testid="menu-report">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <ReportTile label="Orders counted" value={whole(menu.ordersCounted)} hint="Cancelled orders are left out" testId="menu-orders" />
        <ReportTile label="Different dishes picked" value={whole(menu.distinctDishes)} testId="menu-dishes" />
        <ReportTile label="Dishes never picked" value={whole(menu.neverPicked.total)} hint="Active dishes with no order in the period" testId="menu-never" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection title="Most selected dishes" description="In how many orders each dish was chosen.">
          <BarList rows={menu.mostSelected.map((d) => ({ label: d.name, value: d.orders, text: `${whole(d.orders)} ${d.orders === 1 ? "order" : "orders"}`, sub: d.asExtra ? `${whole(d.asExtra)} as an Extra` : undefined }))} />
        </ReportSection>
        <ReportSection title="Least selected dishes" description="Dishes that were picked, but least often.">
          <BarList rows={menu.leastSelected.map((d) => ({ label: d.name, value: d.orders, text: `${whole(d.orders)} ${d.orders === 1 ? "order" : "orders"}` }))} />
        </ReportSection>
      </div>
      {menu.neverPicked.total > 0 && (
        <ReportSection title="Never picked" description={`Active dishes nobody chose in this period${menu.neverPicked.total > menu.neverPicked.names.length ? ` (showing ${menu.neverPicked.names.length} of ${whole(menu.neverPicked.total)})` : ""}.`}>
          <p className="text-sm" data-testid="menu-never-list">
            {menu.neverPicked.names.join(", ")}
          </p>
        </ReportSection>
      )}
      <ReportSection title="Menu Type performance and popularity" description="An order that uses several Menu Types shares its total evenly between them, so the revenue column adds up to the real total.">
        {menu.menuTypes.length === 0 ? (
          <Empty />
        ) : (
          <Table
            testId="menu-types"
            columns={[{ label: "Menu Type" }, { label: "Orders", align: "right" }, { label: "Share", align: "right" }, { label: "Meals", align: "right" }, { label: "Average per order", align: "right" }, { label: "Revenue", align: "right" }]}
            rows={menu.menuTypes.map((m) => [m.name, whole(m.orders), `${m.sharePercent}%`, whole(m.meals), inr(m.avgPerOrder), inr(m.revenue)])}
            min="36rem"
          />
        )}
      </ReportSection>
    </div>
  );
}

// ----------------------------------------------------------- Inventory

export function InventoryView({ stock, movements, purchases }: { stock: StockReport; movements: MovementReport; purchases: PurchaseReport }) {
  return (
    <div className="flex flex-col gap-4" data-testid="inventory-report">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ReportTile label="Stock value" value={inr(stock.totalValue)} hint={stock.itemsWithoutCost ? `${whole(stock.itemsWithoutCost)} items have no cost, counted as 0` : "Stock on hand x cost per unit, as of today"} testId="inv-value" />
        <ReportTile label="Low-stock items" value={whole(stock.lowStock.length)} testId="inv-low" />
        <ReportTile label="Purchases ordered" value={inr(purchases.orderedValue)} hint={`${whole(purchases.orders)} purchase ${purchases.orders === 1 ? "order" : "orders"}`} testId="inv-ordered" />
        <ReportTile label="Received so far" value={inr(purchases.receivedValue)} hint={`${inr(purchases.stillToReceive)} still to arrive`} testId="inv-received" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection title="Stock value by category" description="As of today, not limited to the date range.">
          <BarList rows={stock.byCategory.map((c) => ({ label: c.category, value: c.value, text: inr(c.value), sub: `${whole(c.items)} ${c.items === 1 ? "item" : "items"}` }))} emptyText="No inventory items yet." />
        </ReportSection>
        <ReportSection title="Low-stock items" description="At or below their alert level, lowest first.">
          {stock.lowStock.length === 0 ? (
            <Empty text="Nothing is running low." />
          ) : (
            <Table
              testId="inv-low-list"
              columns={[{ label: "Item" }, { label: "In stock", align: "right" }, { label: "Alert at", align: "right" }]}
              rows={stock.lowStock.map((i) => [<Link key={i.id} href="/inventory" className="text-primary hover:underline">{i.name}</Link>, `${qty(i.stock)} ${i.unit}`, `${qty(i.threshold)} ${i.unit}`])}
              min="20rem"
            />
          )}
        </ReportSection>
      </div>
      {stock.expiring.length > 0 && (
        <ReportSection title="Expiring soon" description="Stock that has expired or expires within 30 days.">
          <Table
            testId="inv-expiring"
            columns={[{ label: "Item" }, { label: "In stock", align: "right" }, { label: "Expires", align: "right" }]}
            rows={stock.expiring.map((i) => [i.name, `${qty(i.stock)} ${i.unit}`, i.daysLeft < 0 ? `Expired ${-i.daysLeft} ${i.daysLeft === -1 ? "day" : "days"} ago` : `${longDate(i.expiryDate)} (${i.daysLeft === 0 ? "today" : `${i.daysLeft} days`})`])}
            min="22rem"
          />
        </ReportSection>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ReportTile label="Stock movements" value={whole(movements.movements)} hint="In the period" testId="inv-moves" />
        <ReportTile label="Stock in (value)" value={inr(movements.stockInValue)} testId="inv-in" />
        <ReportTile label="Stock out (value)" value={inr(movements.stockOutValue)} hint={`${whole(movements.takenForOrders)} taken for orders`} testId="inv-out" />
        <ReportTile label="Adjustments (value)" value={inr(movements.adjustmentValue)} hint="Negative means stock written down" testId="inv-adj" />
      </div>
      <ReportSection title="Busiest items" description="The items with the most stock movements in the period.">
        {movements.busiest.length === 0 ? (
          <Empty />
        ) : (
          <Table testId="inv-busiest" columns={[{ label: "Item" }, { label: "Moves", align: "right" }, { label: "In", align: "right" }, { label: "Out", align: "right" }]} rows={movements.busiest.map((b) => [b.name, whole(b.moves), `${qty(b.inQty)} ${b.unit}`, `${qty(b.outQty)} ${b.unit}`])} min="24rem" />
        )}
      </ReportSection>
      <ReportSection title="Purchases by supplier" description="Purchase orders placed in the period (drafts and cancelled ones are left out).">
        {purchases.bySupplier.length === 0 ? (
          <Empty />
        ) : (
          <Table testId="inv-suppliers" columns={[{ label: "Supplier" }, { label: "Orders", align: "right" }, { label: "Ordered", align: "right" }, { label: "Received", align: "right" }]} rows={purchases.bySupplier.map((s) => [s.supplierName, whole(s.orders), inr(s.orderedValue), inr(s.receivedValue)])} min="26rem" />
        )}
      </ReportSection>
    </div>
  );
}

// ------------------------------------------------------------- Finance

export function FinanceView({ finance, receivables, payables, showKitchen = false, orderLinks = false }: { finance: FinanceReport; receivables: ReceivablesReport; payables: PayablesReport; showKitchen?: boolean; orderLinks?: boolean }) {
  return (
    <div className="flex flex-col gap-4" data-testid="finance-report">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ReportTile label="Revenue (order totals)" value={inr(finance.revenue)} hint="Cancelled orders are left out" testId="fin-revenue" />
        <ReportTile label="Expenses" value={inr(finance.expenses)} testId="fin-expenses" />
        <ReportTile label="Profit" value={inr(finance.profit)} hint={finance.marginPercent === null ? undefined : `${percent(finance.marginPercent)} of revenue`} testId="fin-profit" />
        <ReportTile label="Owed to you" value={inr(receivables.total)} hint={`${whole(receivables.orders)} ${receivables.orders === 1 ? "order" : "orders"} with a balance. You owe ${inr(payables.total)}`} testId="fin-owed" />
      </div>
      <ReportSection title="Revenue and expenses by month" description="Revenue by the month the order was placed, expenses by the date they were spent.">
        {finance.months.length === 0 ? (
          <Empty />
        ) : (
          <Table
            testId="fin-months"
            columns={[{ label: "Month" }, { label: "Revenue", align: "right" }, { label: "Expenses", align: "right" }, { label: "Profit", align: "right" }]}
            rows={finance.months.map((m) => [m.label, inr(m.revenue), inr(m.expenses), <span key={m.month} className={m.profit < 0 ? "text-destructive" : ""}>{inr(m.profit)}</span>])}
            min="26rem"
          />
        )}
      </ReportSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection title="Revenue and expenses side by side" description="Per month: revenue first, then expenses.">
          <BarList
            rows={finance.months.flatMap((m) => [
              { label: `${m.label} revenue`, value: m.revenue, text: inr(m.revenue) },
              { label: `${m.label} expenses`, value: m.expenses, text: inr(m.expenses) },
            ])}
          />
        </ReportSection>
        <ReportSection title="Expenses by category">
          <BarList rows={finance.expensesByCategory.map((c) => ({ label: c.label, value: c.amount, text: inr(c.amount) }))} />
        </ReportSection>
      </div>
      <ReportSection title="Receivables: what customers still owe" description="As of today, not limited to the date range. A balance is due on the event date.">
        <BarList rows={receivables.buckets.map((b) => ({ label: b.label, value: b.amount, text: inr(b.amount), sub: `${whole(b.orders)} ${b.orders === 1 ? "order" : "orders"}` }))} />
        {receivables.biggest.length > 0 && (
          <Table
            testId="fin-biggest"
            columns={[{ label: "Order" }, { label: "Customer" }, { label: "Event date" }, { label: "Balance", align: "right" }]}
            rows={receivables.biggest.map((o) => [
              <span key={o.id} className="text-primary">
                {orderLinks ? <Link href={`/orders/${o.id}`} className="hover:underline">{o.orderNumber ?? "Order"}</Link> : (o.orderNumber ?? "Order")}
                {showKitchen && o.kitchenName && <span className="block text-xs font-normal text-muted-foreground">{o.kitchenName}</span>}
              </span>,
              o.customerName,
              longDate(o.eventDate),
              inr(o.balance),
            ])}
            min="30rem"
          />
        )}
      </ReportSection>
      <ReportSection title="Payables: what you owe suppliers" description="Stock received minus payments made, as of today. Payments are applied to the oldest receipts first.">
        <BarList rows={payables.buckets.map((b) => ({ label: b.label, value: b.amount, text: inr(b.amount) }))} />
        {payables.suppliers.length > 0 && (
          <Table testId="fin-payables" columns={[{ label: "Supplier" }, { label: "Oldest unpaid", align: "right" }, { label: "Outstanding", align: "right" }]} rows={payables.suppliers.map((s) => [s.supplierName, `${s.oldestDays} ${s.oldestDays === 1 ? "day" : "days"}`, inr(s.outstanding)])} min="22rem" />
        )}
      </ReportSection>
    </div>
  );
}

// ---------------------------------------------------------- Storefront

export function StorefrontView({ storefront, channels, recent }: { storefront: StorefrontReport; channels: ChannelRow[]; recent: RecentVisitor[] | null }) {
  const s = storefront;
  const reviewed = s.funnel.reduce((sum, r) => sum + r.reachedReview, 0);
  return (
    <div className="flex flex-col gap-4" data-testid="storefront-report">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ReportTile label="Visits" value={whole(s.visits)} hint="One per person per session; bots are left out" testId="sf-visits" />
        <ReportTile label="Visitors" value={whole(s.visitors)} hint="Same person on the same day counts once" testId="sf-visitors" />
        <ReportTile label="Started the form" value={whole(s.started)} testId="sf-started" />
        <ReportTile label="Orders placed" value={whole(s.submitted)} hint={s.conversionPercent === null ? undefined : `${percent(s.conversionPercent)} of visits`} testId="sf-submitted" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection title="Where visitors came from" description="Google, other websites and frames are detected. For WhatsApp, Instagram, email and QR, use the tagged links (Settings, Platterly Link).">
          <BarList rows={s.bySource.map((r) => ({ label: r.label, value: r.visits, text: `${whole(r.visits)} (${r.sharePercent}%)`, sub: `${whole(r.visitors)} ${r.visitors === 1 ? "visitor" : "visitors"}` }))} emptyText="No visits recorded in this period." />
        </ReportSection>
        <ReportSection title={s.seriesUnit === "day" ? "Visits by day" : "Visits by month"}>
          <BarList rows={s.series.map((p) => ({ label: p.label, value: p.visits, text: whole(p.visits) }))} emptyText="No visits recorded in this period." />
        </ReportSection>
      </div>
      <ReportSection title="From a visit to an order" description="Each journey is credited to where the visitor came from.">
        <BarList
          rows={[
            { label: "Visited", value: s.visits, text: whole(s.visits) },
            { label: "Started the form", value: s.started, text: whole(s.started) },
            { label: "Reached review", value: reviewed, text: whole(reviewed) },
            { label: "Placed an order", value: s.submitted, text: whole(s.submitted) },
          ]}
        />
        {s.funnel.length > 0 && (
          <Table
            testId="sf-funnel"
            columns={[{ label: "Source" }, { label: "Visits", align: "right" }, { label: "Started", align: "right" }, { label: "Reached review", align: "right" }, { label: "Ordered", align: "right" }, { label: "Visit to order", align: "right" }]}
            rows={s.funnel.map((r) => [r.label, whole(r.visits), whole(r.started), whole(r.reachedReview), whole(r.submitted), percent(r.conversionPercent)])}
            min="38rem"
          />
        )}
      </ReportSection>
      <ReportSection title="Orders by channel" description="Which door each order came in through (cancelled orders left out).">
        <Table
          testId="sf-channels"
          columns={[{ label: "Channel" }, { label: "Orders", align: "right" }, { label: "Share", align: "right" }, { label: "Average order", align: "right" }, { label: "Revenue", align: "right" }]}
          rows={channels.map((c) => [c.label, whole(c.orders), `${c.sharePercent}%`, inr(c.avgOrder), inr(c.revenue)])}
          min="30rem"
        />
      </ReportSection>
      <div className="grid gap-4 lg:grid-cols-3">
        <ReportSection title="Devices">
          <BarList rows={s.devices.map((d) => ({ label: d.label, value: d.count, text: whole(d.count) }))} emptyText="No visits recorded." />
        </ReportSection>
        <ReportSection title="Browsers">
          <BarList rows={s.browsers.map((d) => ({ label: d.label, value: d.count, text: whole(d.count) }))} emptyText="No visits recorded." />
        </ReportSection>
        <ReportSection title="Where in the world" description="Needs Cloudflare in front of the site; blank until then.">
          <BarList rows={[...s.countries.map((d) => ({ label: d.label, value: d.count, text: whole(d.count) })), ...s.cities.slice(0, 5).map((d) => ({ label: d.label, value: d.count, text: whole(d.count), sub: "City" }))]} emptyText="No location data yet." />
        </ReportSection>
      </div>
      {(s.embedSites.length > 0 || s.referralSites.length > 0 || s.campaignTags.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ReportSection title="Websites showing your frame">
            <BarList rows={s.embedSites.map((d) => ({ label: d.label, value: d.count, text: whole(d.count) }))} emptyText="None." />
          </ReportSection>
          <ReportSection title="Other websites linking to you">
            <BarList rows={s.referralSites.map((d) => ({ label: d.label, value: d.count, text: whole(d.count) }))} emptyText="None." />
          </ReportSection>
          <ReportSection title="Your own link tags">
            <BarList rows={s.campaignTags.map((d) => ({ label: d.label, value: d.count, text: whole(d.count) }))} emptyText="None." />
          </ReportSection>
        </div>
      )}
      {recent !== null && (
        <ReportSection title="Recent visitors" description="The latest 25 visits in the period. IP addresses are deleted after 90 days. Only owners and managers see this list.">
          {recent.length === 0 ? (
            <Empty text="No visits recorded in this period." />
          ) : (
            <Table
              testId="sf-recent"
              columns={[{ label: "When" }, { label: "From" }, { label: "Device" }, { label: "Place" }, { label: "IP address" }]}
              rows={recent.map((v) => [when.format(v.visitedAt), v.sourceDetail && v.sourceLabel !== v.sourceDetail ? `${v.sourceLabel} (${v.sourceDetail})` : v.sourceLabel, `${v.device}${v.browser ? `, ${v.browser}` : ""}`, v.place || "—", v.ipAddress ?? "—"])}
              min="40rem"
            />
          )}
        </ReportSection>
      )}
    </div>
  );
}
