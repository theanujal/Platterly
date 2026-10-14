import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StageSelect } from "./stage-select";
import { formatDate, menuName, priority, type ProductionCardMenuSelection } from "./production-card";

/** The Kitchen Dashboard's list view: one row per confirmed menu, same data as the cards, stage changeable inline. */
export function ProductionList({ menuSelections }: { menuSelections: (ProductionCardMenuSelection & { event: { order: { orderNumber: string | null } | null } })[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Event type</TableHead>
            <TableHead>Menu</TableHead>
            <TableHead>Guests</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Stage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {menuSelections.map((ms) => {
            const pr = priority(ms.event.startDate);
            return (
              <TableRow key={ms.id}>
                <TableCell className="font-semibold text-primary">{ms.event.order?.orderNumber ?? "—"}</TableCell>
                <TableCell>
                  <Link href={`/kitchen-dashboard/${ms.id}`} className="font-semibold hover:underline">
                    {ms.event.customer.name}
                  </Link>
                </TableCell>
                <TableCell>{ms.event.eventType.name}</TableCell>
                <TableCell>{menuName(ms.event.eventType.menus)}</TableCell>
                <TableCell>{ms.event.guestCount ?? 0}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(ms.event.startDate)}</TableCell>
                <TableCell>
                  <Badge variant={pr.variant}>{pr.label}</Badge>
                </TableCell>
                <TableCell>
                  <StageSelect menuSelectionId={ms.id} currentStage={ms.kitchenProductionStatus} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
