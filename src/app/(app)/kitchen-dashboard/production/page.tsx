import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { getActiveLocation } from "@/modules/locations/active-location";
import { getProductionPlan } from "@/modules/production/production";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Production Planning — Platterly",
  robots: { index: false, follow: false },
};

const formatDate = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function ProductionPlanningPage() {
  const { organizationId, session } = await requireActiveOrganization();
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  await requirePermission({ menus: ["view"] }, organizationId);
  const [plan, canBuy] = await Promise.all([getProductionPlan(organizationId, locationId), hasPermission({ inventory: ["create"] }, organizationId)]);
  const windowText = plan.daysBeforeEvent === 0 ? "today" : `today through the next ${plan.daysBeforeEvent} ${plan.daysBeforeEvent === 1 ? "day" : "days"}`;
  const buyLink = `/purchasing/new?items=${plan.shortfalls.map((s) => `${s.inventoryId}:${s.short}`).join(",")}`;

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Kitchen Dashboard", href: "/kitchen-dashboard" }, { label: "Production Planning" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Production Planning</h1>
        <p className="text-sm text-muted-foreground">What the orders with the kitchen for {windowText} need from the store, worked out from each dish&apos;s recipe (guests plus {plan.extraPercent}% extra).</p>
      </div>
      <Separator />

      {plan.orders.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No orders are with the kitchen for {windowText}.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Shortfall</CardTitle>
              <p className="text-sm text-muted-foreground">Combined need of the orders whose stock is not taken yet, against what is in stock now.</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {plan.shortfalls.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="no-shortfall">Stock covers everything that is still to be taken.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ingredient</TableHead>
                        <TableHead>Needed</TableHead>
                        <TableHead>In stock</TableHead>
                        <TableHead>Short by</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plan.shortfalls.map((s) => (
                        <TableRow key={s.inventoryId}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>
                            {s.needed} {s.unit}
                          </TableCell>
                          <TableCell>
                            {s.inStock} {s.unit}
                          </TableCell>
                          <TableCell>
                            <Badge variant="danger">
                              {s.short} {s.unit}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {canBuy && (
                    <Button className="self-start" render={<Link href={buyLink} />} nativeButton={false}>
                      Create purchase order for the shortfall
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {plan.missingRecipe.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <Badge variant="warning">No recipe</Badge> {plan.missingRecipe.join(", ")} (not counted)
            </p>
          )}

          {plan.orders.map((o) => (
            <Card key={o.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <Link href={`/orders/${o.id}`} className="hover:underline">
                    {o.orderNumber}
                  </Link>
                  <span className="text-sm font-normal text-muted-foreground">
                    {o.customer} · {formatDate(o.eventStartDate)} · {o.guests} guests (cook for {o.servings})
                  </span>
                  {o.taken ? <Badge variant="success">Stock taken</Badge> : <Badge variant="warning">Stock not taken yet</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {o.lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recipe-based needs{o.guests === 0 ? " (add the guest count)" : ""}.</p>
                ) : (
                  <p className="text-sm">{o.lines.map((l) => `${l.name} ${l.needed} ${l.unit}`).join(" · ")}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
