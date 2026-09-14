"use client";

import { useRouter } from "next/navigation";
import { CategoryForm, type CategoryFormValues } from "../../_components/category-form";
import { updateCategoryAction } from "../../actions";

interface EditCategoryClientProps {
  categoryId: string;
  initialValues: CategoryFormValues;
}

export function EditCategoryClient({ categoryId, initialValues }: EditCategoryClientProps) {
  const router = useRouter();

  return (
    <CategoryForm
      initialValues={initialValues}
      submitLabel="Save changes"
      onSubmit={(input) => updateCategoryAction(categoryId, input)}
      onSuccess={() => router.push("/menu-catalog/categories")}
    />
  );
}
