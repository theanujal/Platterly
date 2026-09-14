import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listMenus } from "@/modules/menus/menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MenuRowActions } from "./_components/menu-row-actions";

export const metadata: Metadata = {
  title: "Menus — Platterly",
  robots: { index: false, follow: false },
};

export default async function MenusPage() {
  const { organizationId } = await requireActiveOrganization();
  const menus = await listMenus(organizationId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Menus</h1>
          <p className="text-sm text-muted-foreground">Named, curated groupings of your catalog items.</p>
        </div>
        <Button render={<Link href="/menu-catalog/menus/new" />} nativeButton={false}>
          New Menu
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {menus.map((menu) => (
            <TableRow key={menu.id}>
              <TableCell>
                <Link href={`/menu-catalog/menus/${menu.id}`} className="font-medium hover:underline">
                  {menu.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={menu.isActive ? "default" : "secondary"}>{menu.isActive ? "Active" : "Inactive"}</Badge>
              </TableCell>
              <TableCell>
                <MenuRowActions menuId={menu.id} name={menu.name} />
              </TableCell>
            </TableRow>
          ))}
          {menus.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                No menus yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
