import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listAddOns } from "@/modules/addons/addon";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { ActiveBadge, CATALOG_GRID_CLASSNAME, CatalogCardBody, CatalogCardMedia, CatalogNameCell, formatRupees } from "@/components/catalog/catalog-display";
import { AddAddOnDialog } from "./_components/add-addon-dialog";
import { AddOnCardActions } from "./_components/addon-card-actions";
import type { AddOnFormValues } from "./_components/addon-form";

export const metadata: Metadata = {
  title: "Add-ons — Platterly",
  robots: { index: false, follow: false },
};

function AddOnTypeBadge({ type, onImage = false }: { type: "LIVE_COUNTER" | "SPECIAL_ADD_ON"; onImage?: boolean }) {
  const live = type === "LIVE_COUNTER";
  // On a photo a tinted badge would wash out, so it sits on a solid pill like the Veg tag.
  return (
    <Badge variant={live ? "violet" : "neutral"} className={cn(onImage && "h-10 bg-background px-3.5 text-sm shadow-sm", onImage && live && "text-tone-violet", onImage && !live && "text-foreground")}>
      {live ? "Live Counter" : "Special Add-on"}
    </Badge>
  );
}

function formatPrice(price: number, priceType: "PER_PLATE" | "FIXED", included = false) {
  if (included) return "Included";
  const amount = formatRupees(price);
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
      includedInPackage: addOn.includedInPackage,
      imageUrl: addOn.image,
      isActive: addOn.isActive,
    };

    return {
      id: addOn.id,
      searchText: `${addOn.name} ${addOn.description ?? ""}`,
      filterValues: { type: addOn.type },
      sortValues: { name: addOn.name, price: Number(addOn.price), newest: addOn.createdAt.getTime() },
      card: (
        <>
          <CatalogCardMedia
            src={addOn.image}
            icon={Sparkles}
            overlay={
              <>
                <AddOnTypeBadge type={addOn.type} onImage />
                <AddOnCardActions addOnId={addOn.id} name={addOn.name} initialValues={initialValues} />
              </>
            }
          />
          <CatalogCardBody
            title={addOn.name}
            description={addOn.description}
            footer={<span className="text-base font-semibold">{formatPrice(Number(addOn.price), addOn.priceType, addOn.includedInPackage)}</span>}
            active={addOn.isActive}
          />
        </>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <CatalogNameCell name={addOn.name} description={addOn.description} src={addOn.image} icon={Sparkles} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <AddOnTypeBadge type={addOn.type} />
          </TableCell>
          <TableCell className="px-3 py-3 text-sm font-semibold">{formatPrice(Number(addOn.price), addOn.priceType, addOn.includedInPackage)}</TableCell>
          <TableCell className="px-3 py-3">
            <ActiveBadge active={addOn.isActive} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">
              <AddOnCardActions addOnId={addOn.id} name={addOn.name} initialValues={initialValues} variant="plain" />
            </div>
          </TableCell>
        </>
      ),
    };
  });

  const filterOptions: CatalogFilterOption[] = [
    {
      key: "type",
      allLabel: "Type",
      options: [
        { value: "LIVE_COUNTER", label: "Live Counter" },
        { value: "SPECIAL_ADD_ON", label: "Special Add-on" },
      ],
    },
  ];

  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "name", label: "Name (A–Z)", key: "name" },
    { value: "price-low", label: "Price (Low–High)", key: "price" },
    { value: "price-high", label: "Price (High–Low)", key: "price", direction: "desc" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Menu Catalog", href: "/menu-catalog" }, { label: "Add-ons" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Add-ons</h1>
          <p className="text-sm text-muted-foreground">Live counters and special add-ons your customers can add on.</p>
        </div>
        <AddAddOnDialog />
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        defaultView="list"
        addTile={<AddAddOnDialog variant="tile" />}
        columns={["Add-on", "Type", "Price", "Status", ""]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search add-ons…"
        emptyLabel="No add-ons yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        pageSize={16}
      />
    </div>
  );
}
