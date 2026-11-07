import type { Metadata } from "next";
import { CancelEmailChange } from "@/components/auth/cancel-email-change";
import { requireAccountHost } from "@/lib/account/guard";

export const metadata: Metadata = { title: "Cancel email change", robots: { index: false, follow: false } };

// The link in the old address's notice. No session is needed: the secret token in the link is the credential.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccountHost();
  const token = (await searchParams).token;
  return <CancelEmailChange token={typeof token === "string" ? token : ""} />;
}
