import Link from "next/link";
import { ProductLogo } from "@/components/product-logo";
import { platformAuthOrigin } from "@/lib/platform/config";

// Shown instead of the sign-in form when a central sign-in came back with a problem so the person is not sent round in a circle.
const NOT_LINKED = new Set(["account_not_linked", "unable_to_link_account", "account not linked", "unable to link account"]);

export function SsoProblem({ code }: { code: string }) {
  const notLinked = NOT_LINKED.has(code.toLowerCase().replace(/\+/g, " "));
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
      <ProductLogo src={`${platformAuthOrigin()}/api/product-logo/caterly`} className="size-14" />
      <h2 className="text-2xl font-bold">We could not sign you in</h2>
      <p role="alert" className="text-sm text-muted-foreground" data-sso-problem={notLinked ? "not-linked" : "failed"}>
        {notLinked
          ? "This Platterly account is not linked to your Caterly account yet. Ask your administrator, or contact Platterly support."
          : "Something went wrong while signing you in with Platterly. Please try again."}
      </p>
      <div className="flex flex-col items-center gap-2 text-sm">
        <Link href="/api/platform/sso/start" className="font-semibold text-primary hover:underline">
          Try again
        </Link>
      </div>
    </div>
  );
}
