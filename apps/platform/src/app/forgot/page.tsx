import { Suspense } from "react";
import { ForgotForm } from "@/components/auth/forms";
import { Branded } from "@/components/auth/branded";
import { requireHost } from "@/modules/auth/host";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireHost("auth");
  return (
    <Branded searchParams={searchParams}>
      <Suspense>
        <ForgotForm />
      </Suspense>
    </Branded>
  );
}
