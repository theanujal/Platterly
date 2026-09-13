"use client";

import { useRouter } from "next/navigation";
import { TenantProfileForm } from "../../_components/tenant-profile-form";
import { createTenantAction } from "../../actions";

export function NewTenantClient() {
  const router = useRouter();

  return (
    <TenantProfileForm
      includeSlug
      submitLabel="Create caterer"
      onSubmit={(values) => createTenantAction(values)}
      onSuccess={() => router.push("/super/tenants")}
    />
  );
}
