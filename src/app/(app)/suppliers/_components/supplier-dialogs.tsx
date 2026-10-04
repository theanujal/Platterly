"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { AddDrawer, FormDrawer } from "@/components/catalog/form-drawer";
import { CatalogCardMenu } from "@/components/catalog/catalog-card-menu";
import { SupplierForm, type SupplierFormValues } from "./supplier-form";
import { createSupplierAction, deleteSupplierAction, setSupplierActiveAction, updateSupplierAction } from "../actions";

export function AddSupplierDialog({ variant = "button" }: { variant?: "button" | "tile" }) {
  const router = useRouter();
  return (
    <AddDrawer variant={variant} buttonLabel="Add Supplier" tileLabel="Add New Supplier" tileDescription="Someone you buy from" title="New Supplier">
      {(close) => (
        <SupplierForm
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
export function SupplierCardActions({ id, name, initialValues, variant }: { id: string; name: string; initialValues: SupplierFormValues; variant?: "overlay" | "plain" }) {
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
      <EditSupplierDrawer open={editOpen} onOpenChange={setEditOpen} id={id} initialValues={initialValues} />
    </>
  );
}

export function EditSupplierDrawer({ open, onOpenChange, id, initialValues }: { open: boolean; onOpenChange: (open: boolean) => void; id: string; initialValues: SupplierFormValues }) {
  const router = useRouter();
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Edit Supplier">
      <SupplierForm
        key={JSON.stringify(initialValues)}
        initialValues={initialValues}
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
