import Link from "next/link";
import { COMPANY, SITE } from "@/content/site";

const HEAD = "text-lg font-medium text-cloud";
const LIST = "mt-3 flex flex-col gap-2.5";
const LINK = "text-sm text-mist-gray transition-colors duration-150 hover:text-cloud";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title}>
      <p className={HEAD}>{title}</p>
      <div className={LIST}>{children}</div>
    </nav>
  );
}

/** Calendly's footer: one big dark rounded panel inset from the page edge, the sign-off line and logo on the left, grouped links on the right, a rule, then the legal row. */
export function Footer() {
  return (
    <footer className="px-3 pb-3 pt-20 sm:px-6 md:pt-28">
      <div className="rounded-[28px] bg-ink-navy text-cloud sm:rounded-[40px]">
        <div className="mx-auto w-full max-w-[1200px] px-5 pb-10 pt-16 sm:px-8 md:pt-20">
          <div className="grid gap-16 lg:grid-cols-[1fr_1.5fr]">
            <div className="flex flex-col justify-between gap-20">
              <p className="h-hero max-w-md">Make space for what matters.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/platterly-logo-white.svg" alt="Platterly" width={150} height={34} className="h-10 w-auto self-start" />
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-3">
              <Group title="Products">
                <Link href="/catering/" className={LINK}>
                  Catering by Platterly
                </Link>
              </Group>
              <Group title="Discover">
                <Link href="/about/" className={LINK}>
                  About Platterly
                </Link>
                <Link href="/blog/" className={LINK}>
                  Blog
                </Link>
                <Link href="/whats-new/" className={LINK}>
                  What&apos;s new
                </Link>
                <Link href="/upcoming/" className={LINK}>
                  Upcoming features
                </Link>
              </Group>
              <Group title="Support">
                <Link href="/contact/" className={LINK}>
                  Contact us
                </Link>
                <Link href="/talk-to-us/" className={LINK}>
                  Talk to us
                </Link>
                <a href={SITE.appUrl} className={LINK}>
                  Log in
                </a>
              </Group>
            </div>
          </div>
          <div className="mt-16 flex flex-col gap-4 border-t border-cloud/15 pt-8 text-sm text-mist-gray md:flex-row md:items-center md:justify-between">
            <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
              {[
                ["/privacy/", "Privacy Policy"],
                ["/terms/", "Terms and Conditions"],
                ["/refund/", "Cancellation and Refund"],
                ["/cookie-policy/", "Cookie Policy"],
                ["/shipping-and-delivery/", "Shipping and Delivery"],
                ["/security/", "Security"],
              ].map(([href, label]) => (
                <Link key={href} href={href} className="transition-colors hover:text-cloud">
                  {label}
                </Link>
              ))}
            </nav>
            <p>
              © {new Date().getFullYear()} Platterly, a product of {COMPANY.legalName}. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
