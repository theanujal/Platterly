import { SiteFrame } from "@/components/site-frame";
import { ButtonLink, Section } from "@/components/ui";

export default function NotFound() {
  return (
    <SiteFrame>
    <Section>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-5 py-12 text-center">
        <h1 className="h-section">This page does not exist.</h1>
        <p className="text-lg text-slate-gray">The page may have moved, or the address may have a typo.</p>
        <ButtonLink href="/">Back to Platterly</ButtonLink>
      </div>
    </Section>
    </SiteFrame>
  );
}
