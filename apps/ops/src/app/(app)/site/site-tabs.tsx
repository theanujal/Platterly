"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/site", label: "Publish" },
  { href: "/site/notice", label: "Notice bar" },
  { href: "/site/contact", label: "Contact" },
  { href: "/site/releases", label: "What's new" },
  { href: "/site/posts", label: "Blog" },
  { href: "/site/pages", label: "Legal pages" },
] as const;

export function SiteTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Website sections" className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map(({ href, label }) => {
        const active = href === "/site" ? pathname === "/site" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium ${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
