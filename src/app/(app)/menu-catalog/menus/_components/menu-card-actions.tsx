"use client";

import { useState } from "react";
import { CatalogCardMenu } from "@/components/catalog/catalog-card-menu";
import { EditMenuDialog } from "./edit-menu-dialog";
import type { MenuFormValues, AssignedCategory } from "./menu-form";
import { deleteMenuAction, duplicateMenuAction, setMenuActiveAction } from "../actions";

interface MenuCardActionsProps {
  menuId: string;
  name: string;
  initialValues: MenuFormValues;
  categories: { id: string; name: string }[];
  assignedCategories: AssignedCategory[];
  variant?: "overlay" | "plain";
}

/** 3-dot menu for a Menu Type card or row: Edit (popup), Duplicate, Activate / Deactivate, Delete. */
export function MenuCardActions({ menuId, name, initialValues, categories, assignedCategories, variant }: MenuCardActionsProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <CatalogCardMenu
        name={name}
        entityLabel="Menu Type"
        isActive={initialValues.isActive}
        variant={variant}
        onEdit={() => setEditOpen(true)}
        onDuplicate={() => duplicateMenuAction(menuId)}
        onSetActive={(active) => setMenuActiveAction(menuId, active)}
        onDelete={() => deleteMenuAction(menuId)}
        deleteDescription="The menu items themselves aren't deleted, only this grouping."
      />
      <EditMenuDialog open={editOpen} onOpenChange={setEditOpen} menuId={menuId} initialValues={initialValues} categories={categories} assignedCategories={assignedCategories} />
    </>
  );
}
