import type { Metadata } from "next";
import { EnquiryForm } from "@/components/enquiry-form";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { ButtonLink } from "@/components/ui";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "Talk to us",
  description: "Tell us about your catering business and we will show you how Catering by Platterly fits. A short call, no pressure.",
  alternates: { canonical: "/talk-to-us/" },
};

const STEPS = [
  { title: "You tell us about your business", text: "A few details, so that when we call we ask the right questions and do not waste your time." },
  { title: "We call you back", text: "A short, friendly call to understand how you work today and to answer anything you are wondering about." },
  { title: "You try it free", text: "Every account starts with seven days of full access and no card. Bring your own events and see if it fits." },
];

export default function TalkToUsPage() {
  return (
    <>
      <PageHero eyebrow="Talk to us" title="Let's see how Platterly fits your kitchen">
        <p>Tell us about your catering business. A real person will call you back, show you around and answer your questions.</p>
      </PageHero>
      <div className="mx-auto grid w-full max-w-[1200px] gap-14 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
        <Reveal from="left">
          <h2 className="h-section">What happens next</h2>
          <ol className="mt-10 flex flex-col gap-8">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-medium">{index + 1}</span>
                <div>
                  <h3 className="text-xl font-medium">{step.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-slate-gray">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-12 rounded-[24px] bg-pebble p-6">
            <p className="text-lg font-medium">Rather start right away?</p>
            <p className="mt-1 text-slate-gray">You can create your account and look around on your own.</p>
            <div className="mt-4">
              <ButtonLink href={SITE.appUrl}>Get started for free</ButtonLink>
            </div>
          </div>
        </Reveal>
        <Reveal from="right" delay={100}>
          <div className="rounded-[36px] bg-paper/40 p-2 ring-1 ring-ink-navy/10">
            <div className="rounded-[30px] bg-paper p-6 shadow-product sm:p-10">
              <h2 className="h-sub">Request a call</h2>
              <p className="mb-8 mt-2 text-slate-gray">It takes a minute.</p>
              <EnquiryForm kind="talk" />
            </div>
          </div>
        </Reveal>
      </div>
    </>
  );
}
