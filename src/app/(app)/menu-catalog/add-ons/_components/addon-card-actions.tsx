"use client";

import { useState } from "react";
import { CatalogCardMenu } from "@/components/catalog/catalog-card-menu";
import { EditAddOnDialog } from "./edit-addon-dialog";
import type { AddOnFormValues } from "./addon-form";
import { deleteAddOnAction, duplicateAddOnAction, setAddOnActiveAction } from "../actions";

interface AddOnCardActionsProps {
  addOnId: string;
  name: string;
  initialValues: AddOnFormValues;
  variant?: "overlay" | "plain";
}

/** 3-dot menu for a Add-on card or row: Edit (popup), Duplicate, Activate / Deactivate, Delete. */
export function AddOnCardActions({ addOnId, name, initialValues, variant }: AddOnCardActionsProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <CatalogCardMenu
        name={name}
        entityLabel="Add-on"
        isActive={initialValues.isActive}
        variant={variant}
        onEdit={() => setEditOpen(true)}
        onDuplicate={() => duplicateAddOnAction(addOnId)}
        onSetActive={(active) => setAddOnActiveAction(addOnId, active)}
        onDelete={() => deleteAddOnAction(addOnId)}
        deleteDescription="This add-on will be removed from your catalog."
      />
      <EditAddOnDialog open={editOpen} onOpenChange={setEditOpen} addOnId={addOnId} initialValues={initialValues} />
    </>
  );
}
