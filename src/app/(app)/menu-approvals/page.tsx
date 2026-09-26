import type { Metadata } from "next";
import Link from "next/link";
import { Circle, Clock, TriangleAlert, Check, Lock } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listMenuSelectionsForKitchen } from "@/modules/menu-approvals/menu-approval";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableHeader, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MenuApprovalsFilterBar } from "./_components/menu-approvals-filter-bar";
import { MENU_SELECTION_STATUS_LABEL, MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Menu Approvals — Platterly",
  robots: { index: false, follow: false },
};

const STATUS_LABEL = MENU_SELECTION_STATUS_LABEL;

// Shared neutral/info/warning/success legend (modules/orders/order-status.ts) — one vocabulary across the queue, this page and the Order page.
const STATUS_VARIANT = MENU_SELECTION_STATUS_TONE;

const STATUS_ICON: Record<MenuSelectionStatus, LucideIcon> = {
  DRAFT: Circle,
  SENT_TO_CUSTOMER: Clock,
  CUSTOMER_REVIEWING: Clock,
  CHANGES_REQUESTED: TriangleAlert,
  CUSTOMER_APPROVED: Check,
  KITCHEN_REVIEWING: Clock,
  KITCHEN_CHANGES_REQUESTED: TriangleAlert,
  KITCHEN_APPROVED: Check,
  FINAL_LOCKED: Lock,
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

interface MenuApprovalsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function MenuApprovalsPage({ searchParams }: MenuApprovalsPageProps) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["approve"] }, organizationId);
  const { status } = await searchParams;
  const validStatus = status && status in STATUS_LABEL ? (status as MenuSelectionStatus) : undefined;

  const menuSelections = await listMenuSelectionsForKitchen(organizationId, validStatus ? [validStatus] : undefined);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Menu Approvals" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Menu Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Every customer&apos;s menu selection, from kitchen review through to a final, locked menu.
        </p>
      </div>
      <Separator />

      <div className="flex flex-wrap items-center gap-2">
        <MenuApprovalsFilterBar />
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Event Date</TableHead>
              <TableHead>Kitchen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {menuSelections.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  No menu selections yet.
                </TableCell>
              </TableRow>
            ) : (
              menuSelections.map((menuSelection) => {
                const StatusIcon = STATUS_ICON[menuSelection.status];
                return (
                <TableRow key={menuSelection.id}>
                  <TableCell className="font-medium">{menuSelection.event.customer.name}</TableCell>
                  <TableCell>{menuSelection.event.name}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(menuSelection.event.startDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{menuSelection.event.assignedKitchen?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[menuSelection.status]}>
                      <StatusIcon data-icon="inline-start" />
                      {STATUS_LABEL[menuSelection.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(menuSelection.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="md" variant="outline" render={<Link href={`/menu-approvals/${menuSelection.id}`} />} nativeButton={false}>
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
