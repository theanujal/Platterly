import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "@/components/icons";

/** A plain text link with an arrow, as calendly.com's "View all integrations". */
export function ButtonLinkInline({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 pt-2 text-base font-medium transition-opacity duration-150 hover:opacity-70">
      {children} <ArrowRight className="size-5" aria-hidden />
    </Link>
  );
}
