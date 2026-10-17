import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { requireActiveOrganization, requirePermission, canSee } from "@/lib/auth/require-session";
import { listAddOns } from "@/modules/addons/addon";
import { listMenus } from "@/modules/menus/menu";
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
  title: "Add-ons — Caterly",
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

/** "All menus", or the names of the menus that offer it. Shown instead of a price once an add-on is in the package. */
function menusLabel(addOn: { appliesToAllMenus: boolean; menus: { menuId: string }[] }, menuNames: Map<string, string>) {
  if (addOn.appliesToAllMenus) return "All menus";
  const names = addOn.menus.map((m) => menuNames.get(m.menuId)).filter((n): n is string => !!n);
  return names.length > 0 ? names.join(", ") : "No menus";
}

function formatPrice(price: number, priceType: "PER_PLATE" | "FIXED", included = false) {
  if (included) return "Included";
  const amount = formatRupees(price);
  return priceType === "PER_PLATE" ? `${amount} / plate` : `${amount} flat`;
}

export default async function AddOnsPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["view"] }, organizationId);
  const [addOns, menus, showPrices] = await Promise.all([listAddOns(organizationId), listMenus(organizationId), canSee("menuPrices", organizationId)]);
  const availableMenus = menus.map((m) => ({ id: m.id, name: m.name }));
  const menuNames = new Map(availableMenus.map((m) => [m.id, m.name]));

  const entries: CatalogEntry[] = addOns.map((addOn) => {
    const initialValues: AddOnFormValues = {
      name: addOn.name,
      description: addOn.description ?? "",
      type: addOn.type,
      priceType: addOn.priceType,
      price: showPrices ? addOn.price.toString() : "",
      includedInPackage: addOn.includedInPackage,
      appliesToAllMenus: addOn.appliesToAllMenus,
      menuIds: addOn.menus.map((m) => m.menuId),
      imageUrl: addOn.image,
      isActive: addOn.isActive,
    };

    return {
      id: addOn.id,
      searchText: `${addOn.name} ${addOn.description ?? ""}`,
      filterValues: { type: addOn.type },
      sortValues: { name: addOn.name, ...(showPrices ? { price: Number(addOn.price) } : {}), newest: addOn.createdAt.getTime() },
      card: (
        <>
          <CatalogCardMedia
            src={addOn.image}
            icon={Sparkles}
            overlay={
              <>
                <AddOnTypeBadge type={addOn.type} onImage />
                <AddOnCardActions addOnId={addOn.id} name={addOn.name} initialValues={initialValues} availableMenus={availableMenus} />
              </>
            }
          />
          <CatalogCardBody
            title={addOn.name}
            description={addOn.description}
            footer={
              !showPrices ? (
                <span className="truncate text-xs text-muted-foreground" title={menusLabel(addOn, menuNames)}>
                  {menusLabel(addOn, menuNames)}
                </span>
              ) : addOn.includedInPackage ? (
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-base font-semibold">Included</span>
                  <span className="truncate text-xs text-muted-foreground" title={menusLabel(addOn, menuNames)}>
                    {menusLabel(addOn, menuNames)}
                  </span>
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-base font-semibold">{formatPrice(Number(addOn.price), addOn.priceType)}</span>
                  <span className="truncate text-xs text-muted-foreground" title={menusLabel(addOn, menuNames)}>
                    {menusLabel(addOn, menuNames)}
                  </span>
                </div>
              )
            }
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
          {showPrices && <TableCell className="px-3 py-3 text-sm font-semibold">{formatPrice(Number(addOn.price), addOn.priceType, addOn.includedInPackage)}</TableCell>}
          <TableCell className="max-w-64 px-3 py-3 text-sm text-muted-foreground">{menusLabel(addOn, menuNames)}</TableCell>
          <TableCell className="px-3 py-3">
            <ActiveBadge active={addOn.isActive} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">
              <AddOnCardActions addOnId={addOn.id} name={addOn.name} initialValues={initialValues} availableMenus={availableMenus} variant="plain" />
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
    ...(showPrices
      ? [
          { value: "price-low", label: "Price (Low–High)", key: "price" },
          { value: "price-high", label: "Price (High–Low)", key: "price", direction: "desc" as const },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Menu Catalog", href: "/menu-catalog" }, { label: "Add-ons" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Add-ons</h1>
          <p className="text-sm text-muted-foreground">Live counters and special add-ons your customers can add on.</p>
        </div>
        <AddAddOnDialog availableMenus={availableMenus} />
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        defaultView="list"
        addTile={<AddAddOnDialog variant="tile" availableMenus={availableMenus} />}
        columns={["Add-on", "Type", ...(showPrices ? ["Price"] : []), "Menus", "Status", ""]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search add-ons…"
        emptyLabel="No add-ons yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
      />
    </div>
  );
}
