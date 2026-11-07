import Link from "next/link";

// Shown instead of the sign-in form when a central sign-in came back with a problem (PLATFORM_SSO=1 only), so the person is not sent round in a circle.
const NOT_LINKED = new Set(["account_not_linked", "unable_to_link_account", "account not linked", "unable to link account"]);

export function SsoProblem({ code }: { code: string }) {
  const notLinked = NOT_LINKED.has(code.toLowerCase().replace(/\+/g, " "));
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/caterly-mark.svg" alt="Caterly by Platterly" className="size-14" />
      <h2 className="text-2xl font-bold">We could not sign you in</h2>
      <p role="alert" className="text-sm text-muted-foreground" data-sso-problem={notLinked ? "not-linked" : "failed"}>
        {notLinked
          ? "This Platterly account is not linked to your Caterly account yet. Sign in with your email and password, or ask your administrator."
          : "Something went wrong while signing you in with Platterly. Please try again."}
      </p>
      <div className="flex flex-col items-center gap-2 text-sm">
        <Link href="/api/platform/sso/start" className="font-semibold text-primary hover:underline">
          Try again
        </Link>
        <Link href="/?legacy=1" className="font-semibold text-primary hover:underline">
          Sign in with email and password
        </Link>
      </div>
    </div>
  );
}
