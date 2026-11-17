import { Suspense } from "react";
import { SignInForm } from "@/components/auth/forms";
import { Branded } from "@/components/auth/branded";
import { requireHost } from "@/modules/auth/host";

export const metadata = { title: "Sign in" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireHost("auth");
  return (
    <Branded searchParams={searchParams}>
      <Suspense>
        <SignInForm />
      </Suspense>
    </Branded>
  );
}
