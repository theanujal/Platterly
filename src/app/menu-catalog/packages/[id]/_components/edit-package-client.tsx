"use client";

import { useRouter } from "next/navigation";
import { PackageForm, type PackageFormValues } from "../../_components/package-form";
import { updatePackageAction } from "../../actions";

interface EditPackageClientProps {
  packageId: string;
  initialValues: PackageFormValues;
  availableItems: { id: string; name: string }[];
}

export function EditPackageClient({ packageId, initialValues, availableItems }: EditPackageClientProps) {
  const router = useRouter();

  return (
    <PackageForm
      availableItems={availableItems}
      initialValues={initialValues}
      submitLabel="Save changes"
      onSubmit={(formData) => updatePackageAction(packageId, initialValues.imageUrl ?? undefined, formData)}
      onSuccess={() => router.push("/menu-catalog/packages")}
    />
  );
}
