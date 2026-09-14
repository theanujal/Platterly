"use client";

import { useRouter } from "next/navigation";
import { CategoryForm } from "../../_components/category-form";
import { createCategoryAction } from "../../actions";

export function NewCategoryClient() {
  const router = useRouter();

  return (
    <CategoryForm
      submitLabel="Create category"
      onSubmit={createCategoryAction}
      onSuccess={() => router.push("/menu-catalog/categories")}
    />
  );
}
