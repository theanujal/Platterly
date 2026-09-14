import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listAddOns } from "@/modules/addons/addon";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry } from "@/components/catalog/catalog-browser";
import { AddAddOnDialog } from "./_components/add-addon-dialog";
import { AddOnCardActions } from "./_components/addon-card-actions";
import type { AddOnFormValues } from "./_components/addon-form";

export const metadata: Metadata = {
  title: "Add-ons — Platterly",
  robots: { index: false, follow: false },
};

function formatPrice(price: number, priceType: "PER_PLATE" | "FIXED") {
  const amount = `₹${Number(price).toFixed(2)}`;
  return priceType === "PER_PLATE" ? `${amount} / plate` : `${amount} flat`;
}

export default async function AddOnsPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["view"] }, organizationId);
  const addOns = await listAddOns(organizationId);

  const entries: CatalogEntry[] = addOns.map((addOn) => {
    const initialValues: AddOnFormValues = {
      name: addOn.name,
      description: addOn.description ?? "",
      type: addOn.type,
      priceType: addOn.priceType,
      price: addOn.price.toString(),
      imageUrl: addOn.image,
      isActive: addOn.isActive,
    };

    return {
      id: addOn.id,
      searchText: `${addOn.name} ${addOn.description ?? ""}`,
      card: (
        <>
          {addOn.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={addOn.image} alt="" className="aspect-video w-full object-cover" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-muted">
              <Sparkles className="size-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{addOn.name}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                {!addOn.isActive && <Badge variant="secondary">Inactive</Badge>}
                <AddOnCardActions addOnId={addOn.id} name={addOn.name} initialValues={initialValues} />
              </div>
            </div>
            {addOn.description && <p className="line-clamp-2 text-xs text-muted-foreground">{addOn.description}</p>}
            <div className="flex items-center gap-1.5 pt-1">
              <Badge variant={addOn.type === "LIVE_COUNTER" ? "default" : "outline"}>
                {addOn.type === "LIVE_COUNTER" ? "Live Counter" : "Special Add-on"}
              </Badge>
            </div>
            <span className="pt-1 text-sm font-semibold">{formatPrice(Number(addOn.price), addOn.priceType)}</span>
          </div>
        </>
      ),
      listRow: (
        <>
          <TableCell className="font-medium">{addOn.name}</TableCell>
          <TableCell>
            <Badge variant={addOn.type === "LIVE_COUNTER" ? "default" : "outline"}>
              {addOn.type === "LIVE_COUNTER" ? "Live Counter" : "Special Add-on"}
            </Badge>
          </TableCell>
          <TableCell>{formatPrice(Number(addOn.price), addOn.priceType)}</TableCell>
          <TableCell>
            <Badge variant={addOn.isActive ? "default" : "secondary"}>{addOn.isActive ? "Active" : "Inactive"}</Badge>
          </TableCell>
          <TableCell>
            <AddOnCardActions addOnId={addOn.id} name={addOn.name} initialValues={initialValues} />
          </TableCell>
        </>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Add-ons</h1>
          <p className="text-sm text-muted-foreground">Live counters and special add-ons your customers can add on.</p>
        </div>
        <AddAddOnDialog />
      </div>

      <CatalogBrowser
        entries={entries}
        addTile={<AddAddOnDialog variant="tile" />}
        columns={["Name", "Type", "Price", "Status", "Actions"]}
        searchPlaceholder="Search add-ons…"
        emptyLabel="No add-ons yet."
      />
    </div>
  );
}
