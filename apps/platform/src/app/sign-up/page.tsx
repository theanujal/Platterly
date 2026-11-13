import { Suspense } from "react";
import { SignUpClosed, SignUpForm } from "@/components/auth/forms";
import { Branded } from "@/components/auth/branded";
import { requireHost } from "@/modules/auth/host";
import { idp } from "@/modules/auth/idp";
import { identityPool } from "@/modules/auth/identity-db";
import { queryFromSearchParams, signedProduct } from "@/modules/auth/sign-up-origin";
import { openInvitation } from "@/modules/ownership-transfer/invite-signup";
import { ROOT_DOMAIN } from "@/lib/routing/hosts";

// The Terms and Privacy pages live on the marketing site: localhost:3100 in dev, the apex domain in production.
const SITE = ROOT_DOMAIN.startsWith("localhost") ? "http://localhost:3100" : `https://${ROOT_DOMAIN}`;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireHost("auth");
  // Sign-up is for a person who arrived through a registered product's real sign-in link (the provider signs it); anyone else (the Account, the Store, a typed
  // or edited address) sees the closed card.
  const query = queryFromSearchParams(await searchParams);
  const fromProduct = (await signedProduct(identityPool(), query, (await idp().$context).secret)) !== null || (await openInvitation(query)) !== null;
  return (
    <Branded searchParams={searchParams}>
      <Suspense>{fromProduct ? <SignUpForm termsUrl={`${SITE}/terms/`} privacyUrl={`${SITE}/privacy/`} /> : <SignUpClosed />}</Suspense>
    </Branded>
  );
}
