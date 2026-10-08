import { SiteFrame } from "@/components/site-frame";

/** Platterly's own pages: the reference's blue. */
export default function BrandLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame announcement>{children}</SiteFrame>;
}
