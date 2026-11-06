import { headers } from "next/headers";
import { requireAccountSignIn } from "@/lib/account/guard";
import { OverviewView } from "@/components/account/views";
import { hostKind, requestHost } from "@/lib/routing/hosts";

/**
 * The account host shows the Account overview (real data, sign-in required). The auth and store hosts stay placeholders
 * that name the surface that answered; their real pages arrive in later phases.
 */
export default async function Home() {
  const kind = hostKind(requestHost(await headers()));
  if (kind === "account") {
    await requireAccountSignIn("/");
    return <OverviewView />;
  }
  return <main>Platterly {kind}</main>;
}
