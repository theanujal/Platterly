import Link from "next/link";
import { requireSuperAdminOrRedirect } from "../../_lib/guard";
import { listPlans } from "@/modules/subscriptions/plan";
import { ensureTrialPlan } from "@/modules/subscriptions/trial-plan";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Chunk 3 Group 3.3 — Subscription plan catalog (PRD §9, §58). The Trial
// plan is seeded lazily here, not via a migration/seed script — see
// src/modules/subscriptions/trial-plan.ts.
export default async function PlansPage() {
  await requireSuperAdminOrRedirect();
  await ensureTrialPlan();
  const plans = await listPlans();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Subscription Plans</h1>
        <Button render={<Link href="/super/plans/new">New Plan</Link>} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Price / mo</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((plan) => (
            <TableRow key={plan.id}>
              <TableCell>
                <Link href={`/super/plans/${plan.id}`} className="font-medium hover:underline">
                  {plan.name}
                </Link>
                {plan.isTrial && (
                  <Badge variant="secondary" className="ml-2">
                    Trial
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-neutral-500">{plan.code}</TableCell>
              <TableCell>
                {plan.priceMonthly ? `${plan.currency} ${plan.priceMonthly}` : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={plan.isActive ? "default" : "secondary"}>
                  {plan.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
