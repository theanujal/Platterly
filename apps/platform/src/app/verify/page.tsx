import { Suspense } from "react";
import { VerifyForm } from "@/components/auth/forms";
import { requireHost } from "@/modules/auth/host";

export default async function Page() {
  await requireHost("auth");
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
