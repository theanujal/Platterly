"use client";

import { useRouter } from "next/navigation";
import { AddOnForm, type AddOnFormValues } from "../../_components/addon-form";
import { updateAddOnAction } from "../../actions";

interface EditAddOnClientProps {
  addOnId: string;
  initialValues: AddOnFormValues;
}

export function EditAddOnClient({ addOnId, initialValues }: EditAddOnClientProps) {
  const router = useRouter();

  return (
    <AddOnForm
      initialValues={initialValues}
      submitLabel="Save changes"
      onSubmit={(formData) => updateAddOnAction(addOnId, initialValues.imageUrl ?? undefined, formData)}
      onSuccess={() => router.push("/addons")}
    />
  );
}
