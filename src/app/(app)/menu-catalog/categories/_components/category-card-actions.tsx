"use client";

import { useState } from "react";
import { CatalogCardMenu } from "@/components/catalog/catalog-card-menu";
import { EditCategoryDialog } from "./edit-category-dialog";
import type { CategoryFormValues } from "./category-form";
import { deleteCategoryAction, duplicateCategoryAction, setCategoryActiveAction } from "../actions";

interface CategoryCardActionsProps {
  categoryId: string;
  name: string;
  initialValues: Omit<CategoryFormValues, "menuAssignments">;
  availableMenus: { id: string; name: string }[];
  variant?: "overlay" | "plain";
}

/** 3-dot menu for a Category card or row: Edit (popup), Duplicate, Activate / Deactivate, Delete. */
export function CategoryCardActions({ categoryId, name, initialValues, availableMenus, variant }: CategoryCardActionsProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <CatalogCardMenu
        name={name}
        entityLabel="Category"
        isActive={initialValues.isActive}
        variant={variant}
        onEdit={() => setEditOpen(true)}
        onDuplicate={() => duplicateCategoryAction(categoryId)}
        onSetActive={(active) => setCategoryActiveAction(categoryId, active)}
        onDelete={() => deleteCategoryAction(categoryId)}
        deleteDescription="Items and menus using this category aren't deleted, they just lose this tag and assignment."
      />
      <EditCategoryDialog open={editOpen} onOpenChange={setEditOpen} categoryId={categoryId} initialValues={initialValues} availableMenus={availableMenus} />
    </>
  );
}
