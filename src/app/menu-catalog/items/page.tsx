import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listMenuItems } from "@/modules/menus/item";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ItemRowActions } from "./_components/item-row-actions";

export const metadata: Metadata = {
  title: "Menu Items — Platterly",
  robots: { index: false, follow: false },
};

export default async function ItemsPage() {
  const { organizationId } = await requireActiveOrganization();
  const items = await listMenuItems(organizationId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Menu Items</h1>
          <p className="text-sm text-muted-foreground">Your reusable product catalog — dishes and add-ons.</p>
        </div>
        <Button render={<Link href="/menu-catalog/items/new" />} nativeButton={false}>
          New Item
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <Link href={`/menu-catalog/items/${item.id}`} className="font-medium hover:underline">
                  {item.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{item.category?.name ?? "—"}</TableCell>
              <TableCell>
                {item.isFoodProduct ? (
                  <Badge variant={item.foodType === "NON_VEGETARIAN" ? "destructive" : "default"}>
                    {item.foodType === "NON_VEGETARIAN" ? "Non-Veg" : item.foodType === "VEGETARIAN" ? "Veg" : "Food"}
                  </Badge>
                ) : (
                  <Badge variant="secondary">Non-food</Badge>
                )}
              </TableCell>
              <TableCell>₹{Number(item.price).toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Inactive"}</Badge>
              </TableCell>
              <TableCell>{item.isActive && <ItemRowActions itemId={item.id} />}</TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                No menu items yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
