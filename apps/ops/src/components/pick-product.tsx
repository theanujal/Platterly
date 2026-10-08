import { Layers } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { listSwitcherProducts } from "@/lib/selected-product";
import { switchProductAction } from "@/app/(app)/switch-product";

/** Shown by pages that are about one product (plans, sidebar notice) when the sidebar says "All products". */
export async function PickProduct({ what }: { what: string }) {
  const products = await listSwitcherProducts();
  return (
    <Card className="max-w-xl">
      <div className="mb-3 flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><Layers className="size-5" aria-hidden /></div>
      <h2 className="text-base font-semibold">Pick a product</h2>
      <p className="mt-1 text-sm text-muted-foreground">{what} belong to one product. Choose which one to look at, or use the product box at the top of the sidebar.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {products.length === 0 ? <p className="text-sm text-muted-foreground">No products added yet. Add one under Settings, Products.</p> : products.map((p) => (
          <form key={p.key} action={switchProductAction.bind(null, p.key)}><Button type="submit" variant="outline" size="md">{p.name}</Button></form>
        ))}
      </div>
    </Card>
  );
}
