import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/forms";
import { Branded } from "@/components/auth/branded";
import { requireHost } from "@/modules/auth/host";
import { ROOT_DOMAIN } from "@/lib/routing/hosts";

// The Terms and Privacy pages live on the marketing site: localhost:3100 in dev, the apex domain in production.
const SITE = ROOT_DOMAIN.startsWith("localhost") ? "http://localhost:3100" : `https://${ROOT_DOMAIN}`;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireHost("auth");
  return (
    <Branded searchParams={searchParams}>
      <Suspense>
        <SignUpForm termsUrl={`${SITE}/terms/`} privacyUrl={`${SITE}/privacy/`} />
      </Suspense>
    </Branded>
  );
}
