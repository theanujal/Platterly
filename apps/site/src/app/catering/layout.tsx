import { SiteFrame } from "@/components/site-frame";

/** Catering by Platterly's own page. It keeps Platterly's palette: only the product's icon wears its own colour. */
export default function CateringLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame announcement>{children}</SiteFrame>;
}
