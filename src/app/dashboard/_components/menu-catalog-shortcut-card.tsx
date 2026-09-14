import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Chunk 6 — Menu & Product Catalog. Item/menu/package counts are a Chunk
// 8/11 concern (once the storefront/menu-selection actually consume this
// catalog); this card is just a shortcut, same as the other dashboard cards.
export function MenuCatalogShortcutCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Menu Catalog</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Manage your dishes, menus, and priced packages.</p>
        <Button variant="outline" size="sm" render={<Link href="/menu-catalog" />} nativeButton={false} className="self-start">
          Manage catalog
        </Button>
      </CardContent>
    </Card>
  );
}
