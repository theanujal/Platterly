"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { AddDrawer, FormDrawer } from "@/components/catalog/form-drawer";
import { CatalogCardMenu } from "@/components/catalog/catalog-card-menu";
import { SupplierForm, type LocationOption, type ProductOption, type SupplierFormValues } from "./supplier-form";
import { createSupplierAction, deleteSupplierAction, setSupplierActiveAction, updateSupplierAction } from "../actions";

export function AddSupplierDialog({ variant = "button", productOptions, locations }: { variant?: "button" | "tile"; productOptions: ProductOption[]; locations: LocationOption[] | null }) {
  const router = useRouter();
  return (
    <AddDrawer variant={variant} buttonLabel="Add Supplier" tileLabel="Add New Supplier" tileDescription="Someone you buy from" title="New Supplier" size="xl">
      {(close) => (
        <SupplierForm
          productOptions={productOptions} locations={locations}
          submitLabel="Create supplier"
          onSubmit={createSupplierAction}
          onCancel={close}
          onSuccess={() => {
            close();
            router.refresh();
          }}
        />
      )}
    </AddDrawer>
  );
}

/** 3-dot menu on a supplier card, or the icons on a list row: View profile, Edit, Activate / Deactivate, Delete. */
export function SupplierCardActions({ id, name, initialValues, productOptions, locations, variant }: { id: string; name: string; initialValues: SupplierFormValues; productOptions: ProductOption[]; locations: LocationOption[] | null; variant?: "overlay" | "plain" }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  return (
    <>
      <CatalogCardMenu
        name={name}
        entityLabel="Supplier"
        variant={variant}
        isActive={initialValues.isActive}
        extraActions={[{ label: "View profile", ariaLabel: `View profile of ${name}`, icon: Eye, onClick: () => router.push(`/suppliers/${id}`) }]}
        onEdit={() => setEditOpen(true)}
        onSetActive={(active) => setSupplierActiveAction(id, active)}
        onDelete={() => deleteSupplierAction(id)}
        deleteDescription="Only possible while no inventory item or expense uses this supplier. Otherwise deactivate it."
      />
      <EditSupplierDrawer open={editOpen} onOpenChange={setEditOpen} id={id} initialValues={initialValues} productOptions={productOptions} locations={locations} />
    </>
  );
}

export function EditSupplierDrawer({ open, onOpenChange, id, initialValues, productOptions, locations }: { open: boolean; onOpenChange: (open: boolean) => void; id: string; initialValues: SupplierFormValues; productOptions: ProductOption[]; locations: LocationOption[] | null }) {
  const router = useRouter();
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Edit Supplier" size="xl">
      <SupplierForm
        key={JSON.stringify(initialValues)}
        initialValues={initialValues}
        productOptions={productOptions} locations={locations}
        submitLabel="Save changes"
        onSubmit={(formData) => updateSupplierAction(id, formData)}
        onCancel={() => onOpenChange(false)}
        onSuccess={() => {
          onOpenChange(false);
          router.refresh();
        }}
      />
    </FormDrawer>
  );
}
