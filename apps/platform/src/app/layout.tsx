import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { hostKind, requestHost } from "@/lib/routing/hosts";

const dmSans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });

/** One app, three hosts: each host names itself in the browser tab ("Overview · Platterly Account"). The favicon is `icon.svg` beside this file (the Platterly mark). */
export async function generateMetadata(): Promise<Metadata> {
  const kind = hostKind(requestHost(await headers()));
  const name = kind === "account" ? "Platterly Account" : kind === "store" ? "Platterly Store" : "Platterly";
  return { title: { default: name, template: `%s · ${name}` } };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  );
}
