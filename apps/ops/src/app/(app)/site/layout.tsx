import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { SiteTabs } from "./site-tabs";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Website" description="The text on platterly.in. Changes go live when you press Publish." />
      <SiteTabs />
      <div className="mt-6">{children}</div>
      <p className="mt-8 text-xs text-muted-foreground">The home and Catering page copy is still edited in the site&apos;s code. <Link href="/site" className="underline">Back to Publish</Link></p>
    </>
  );
}
