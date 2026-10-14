"use client";

import { useState } from "react";
import { Building2, Mail, MapPin, Plus, Trash2, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { DrawerForm, FormDrawer, useIsDirty } from "@/components/catalog/form-drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconInput } from "@/components/ui/icon-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IconTip } from "@/components/ui/icon-tip";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { InventoryForm } from "@/app/(app)/inventory/_components/inventory-form";
import { createInventoryItemAction } from "@/app/(app)/inventory/actions";
import type { ActionResult } from "../actions";

export interface SupplierFormValues {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  notes: string;
  isActive: boolean;
  /** Products Supplied: the inventory items this supplier provides, and whether it is the preferred supplier for each. */
  products: { inventoryId: string; isPreferred: boolean }[];
}

export interface LocationOption {
  id: string;
  name: string;
}

export interface ProductOption {
  id: string;
  name: string;
  category: string;
  unit: string;
}

export const EMPTY_SUPPLIER_VALUES: SupplierFormValues = { name: "", contactPerson: "", phone: "", email: "", address: "", gstin: "", notes: "", isActive: true, products: [] };

export function SupplierForm({
  initialValues,
  productOptions,
  locations,
  submitLabel,
  onSubmit,
  onSuccess,
  onCancel,
}: {
  initialValues?: SupplierFormValues;
  productOptions: ProductOption[];
  /** Null while multiple locations are off; passed on to the New Inventory Item form. */
  locations: LocationOption[] | null;
  submitLabel: string;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<SupplierFormValues>(initialValues ?? EMPTY_SUPPLIER_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  // Items created from this drawer, so they can be picked before the page's own list has refreshed.
  const [created, setCreated] = useState<ProductOption[]>([]);
  // The New Inventory Item drawer: open with the name typed in the search (or empty).
  const [newItem, setNewItem] = useState<{ name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The product waiting for "Remove this product?" confirmation.
  const [removing, setRemoving] = useState<string | null>(null);
  const dirty = useIsDirty(values);
  const set = <K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  const allOptions = [...productOptions, ...created.filter((c) => !productOptions.some((o) => o.id === c.id))];
  const optionById = new Map(allOptions.map((o) => [o.id, o]));
  const addProduct = (inventoryId: string) =>
    inventoryId && !values.products.some((p) => p.inventoryId === inventoryId) && set("products", [...values.products, { inventoryId, isPreferred: false }]);
  const removeProduct = (inventoryId: string) =>
    set(
      "products",
      values.products.filter((p) => p.inventoryId !== inventoryId),
    );
  const setPreferred = (inventoryId: string, isPreferred: boolean) =>
    set(
      "products",
      values.products.map((p) => (p.inventoryId === inventoryId ? { ...p, isPreferred } : p)),
    );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) if (key !== "products") formData.set(key, String(value));
    formData.set("products", JSON.stringify(values.products));
    const result = await onSubmit(formData);
    setPending(false);
    if (!result.ok) return setError(result.error);
    onSuccess();
  }

  return (
    <>
      <DrawerForm
        dirty={dirty}
        className="md:grid md:grid-cols-2 md:items-start md:gap-0"
        onSubmit={handleSubmit}
        error={error}
        pending={pending}
        submitLabel={submitLabel}
        onCancel={onCancel}
        active={{
          id: "supplier-active",
          checked: values.isActive,
          onChange: (c) => set("isActive", c),
          onLabel: "Active (can be picked)",
          offLabel: "Inactive (hidden from pickers)",
        }}
      >
        <div className="flex flex-col gap-5 md:pr-8">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sup-name">Supplier Name</Label>
            <IconInput icon={Building2} id="sup-name" required value={values.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sup-contact">Contact Person</Label>
            <IconInput icon={User} id="sup-contact" value={values.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-phone">Phone</Label>
              <PhoneInput id="sup-phone" value={values.phone} onChange={(v) => set("phone", v)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-email">Email</Label>
              <IconInput icon={Mail} id="sup-email" type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sup-address">Address</Label>
            <IconInput icon={MapPin} id="sup-address" value={values.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sup-gstin">GSTIN</Label>
            <IconInput icon={Building2} id="sup-gstin" maxLength={20} value={values.gstin} onChange={(e) => set("gstin", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sup-notes">Notes</Label>
            <Textarea id="sup-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-8" data-testid="products-supplied">
          <div>
            <h3 className="text-sm font-semibold">Products Supplied</h3>
            <p className="text-sm text-muted-foreground">Select the inventory items this supplier provides.</p>
          </div>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <SearchableSelect
                aria-label="Add a product"
                placeholder="Search an inventory item"
                searchPlaceholder="Search inventory items…"
                emptyLabel="No inventory item matches."
                onCreate={(typed) => setNewItem({ name: typed })}
                options={allOptions
                  .filter((o) => !values.products.some((p) => p.inventoryId === o.id))
                  .map((o) => ({ value: o.id, label: o.name, hint: `${o.category} · ${o.unit}` }))}
                value=""
                onValueChange={addProduct}
              />
            </div>
            <Button type="button" variant="outline" className="shrink-0" onClick={() => setNewItem({ name: "" })}>
              <Plus /> Add Inventory Item
            </Button>
          </div>
          {notice && (
            <p role="status" className="text-sm text-success">
              {notice}
            </p>
          )}
          {values.products.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              No products added yet. You can save the supplier without any.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2.5">Item</th>
                    <th className="px-3 py-2.5">Preferred</th>
                    <th className="px-3 py-2.5">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {values.products.map((p) => {
                    const option = optionById.get(p.inventoryId);
                    const name = option?.name ?? "Unknown item";
                    return (
                      <tr key={p.inventoryId} className="border-t border-border" data-testid="supplier-product-row">
                        <td className="px-3 py-2.5">
                          <span className="block font-medium">{name}</span>
                          {option && (
                            <span className="block text-xs text-muted-foreground">
                              {option.category} · {option.unit}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Checkbox
                            aria-label={`Preferred supplier for ${name}`}
                            checked={p.isPreferred}
                            onCheckedChange={(checked) => setPreferred(p.inventoryId, checked === true)}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <IconTip label="Remove from this supplier">
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} onClick={() => setRemoving(p.inventoryId)}>
                              <Trash2 className="size-4" />
                            </Button>
                          </IconTip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DrawerForm>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this product?"
        description={`${removing ? (optionById.get(removing)?.name ?? "This item") : ""} will no longer be listed for this supplier. The inventory item itself is not deleted. The change is saved when you save the supplier.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) removeProduct(removing);
          setRemoving(null);
        }}
      />
      {/* The nested drawer sits beside the supplier form, not inside it, so saving the item never submits the supplier. */}
      <FormDrawer open={newItem !== null} onOpenChange={(open) => !open && setNewItem(null)} title="New Inventory Item">
        {newItem && (
          <InventoryForm
            creating
            initialValues={{ name: newItem.name }}
            suppliers={[]}
            locations={locations}
            submitLabel="Create item"
            onSubmit={async (formData) => {
              const result = await createInventoryItemAction(formData);
              if (result.ok && result.id) {
                const item = {
                  id: result.id,
                  name: String(formData.get("name") ?? ""),
                  category: String(formData.get("category") ?? ""),
                  unit: String(formData.get("unit") ?? ""),
                };
                setCreated((list) => [...list, item]);
                // Picked for this supplier straight away; it is saved with the supplier like any other product.
                setValues((v) => ({ ...v, products: [...v.products, { inventoryId: item.id, isPreferred: false }] }));
                setNotice(`${item.name} was added to Inventory and to this supplier. Save the supplier to keep it.`);
              }
              return result;
            }}
            onCancel={() => setNewItem(null)}
            onSuccess={() => {
              setNewItem(null);
              router.refresh();
            }}
          />
        )}
      </FormDrawer>
    </>
  );
}
