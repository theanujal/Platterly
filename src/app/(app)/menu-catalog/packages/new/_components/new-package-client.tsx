"use client";

import { useRouter } from "next/navigation";
import { PackageForm } from "../../_components/package-form";
import { createPackageAction } from "../../actions";

export function NewPackageClient({ availableItems }: { availableItems: { id: string; name: string }[] }) {
  const router = useRouter();

  return (
    <PackageForm
      availableItems={availableItems}
      submitLabel="Create package"
      onSubmit={createPackageAction}
      onSuccess={() => router.push("/menu-catalog/packages")}
    />
  );
}
