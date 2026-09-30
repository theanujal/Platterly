"use client";

import { useState } from "react";
import { CatalogCardMenu } from "@/components/catalog/catalog-card-menu";
import { EditItemDialog } from "./edit-item-dialog";
import type { ItemFormValues } from "./item-form";
import { deleteMenuItemAction, duplicateMenuItemAction, setMenuItemActiveAction } from "../actions";

interface ItemCardActionsProps {
  itemId: string;
  name: string;
  initialValues: ItemFormValues;
  categories: { id: string; name: string }[];
  menus: { id: string; name: string }[];
  variant?: "overlay" | "plain";
}

/** 3-dot menu for a Food Item card or row: Edit (popup), Duplicate, Activate / Deactivate, Delete. */
export function ItemCardActions({ itemId, name, initialValues, categories, menus, variant }: ItemCardActionsProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <CatalogCardMenu
        name={name}
        entityLabel="Food Item"
        isActive={initialValues.isActive}
        variant={variant}
        onEdit={() => setEditOpen(true)}
        onDuplicate={() => duplicateMenuItemAction(itemId)}
        onSetActive={(active) => setMenuItemActiveAction(itemId, active)}
        onDelete={() => deleteMenuItemAction(itemId)}
        deleteDescription="The menus and categories using it aren't deleted, only this item."
      />
      <EditItemDialog open={editOpen} onOpenChange={setEditOpen} itemId={itemId} initialValues={initialValues} categories={categories} menus={menus} />
    </>
  );
}
