import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StageSelect } from "./stage-select";
import { formatDate, menuName, priority, type ProductionCardMenuSelection } from "./production-card";

const HEAD = "h-12 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase";

/** The Kitchen Dashboard's list view: one row per confirmed menu, same data as the cards, stage changeable inline. */
export function ProductionList({ menuSelections }: { menuSelections: (ProductionCardMenuSelection & { event: { order: { orderNumber: string | null } | null } })[] }) {
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead className={HEAD}>Order</TableHead>
            <TableHead className={HEAD}>Customer</TableHead>
            <TableHead className={HEAD}>Event type</TableHead>
            <TableHead className={HEAD}>Menu</TableHead>
            <TableHead className={HEAD}>Guests</TableHead>
            <TableHead className={HEAD}>Date</TableHead>
            <TableHead className={HEAD}>When</TableHead>
            <TableHead className={HEAD}>Stage</TableHead>
            <TableHead className={`${HEAD} w-12`}><span className="sr-only">View details</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {menuSelections.map((ms) => {
            const pr = priority(ms.event.startDate);
            return (
              <TableRow key={ms.id}>
                <TableCell className="px-3 py-3 font-semibold text-primary">
                  <Link href={`/kitchen-dashboard/${ms.id}`} className="hover:underline">
                    {ms.event.order?.orderNumber ?? "—"}
                  </Link>
                </TableCell>
                <TableCell className="px-3 py-3">
                  <Link href={`/kitchen-dashboard/${ms.id}`} className="font-semibold hover:underline">
                    {ms.event.customer.name}
                  </Link>
                </TableCell>
                <TableCell className="px-3 py-3 text-sm">{ms.event.eventType.name}</TableCell>
                <TableCell className="px-3 py-3 text-sm">{menuName(ms.event.eventType.menus)}</TableCell>
                <TableCell className="px-3 py-3 text-sm">{ms.event.guestCount ?? 0}</TableCell>
                <TableCell className="px-3 py-3 text-sm text-muted-foreground">{formatDate(ms.event.startDate)}</TableCell>
                <TableCell className="px-3 py-3">
                  <Badge variant={pr.variant}>{pr.label}</Badge>
                </TableCell>
                <TableCell className="px-3 py-3">
                  <StageSelect menuSelectionId={ms.id} currentStage={ms.kitchenProductionStatus} />
                </TableCell>
                <TableCell className="px-3 py-3 text-right">
                  <Link
                    href={`/kitchen-dashboard/${ms.id}`}
                    aria-label={`View details for ${ms.event.customer.name}`}
                    title="View details"
                    className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronRight className="size-5" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
