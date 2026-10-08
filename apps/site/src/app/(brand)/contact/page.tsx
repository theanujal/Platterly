import type { Metadata } from "next";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { EnquiryForm } from "@/components/enquiry-form";
import { Faq } from "@/components/faq";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { CONTACT } from "@/content/site";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Questions, help with your account or an idea for Catering by Platterly? Write to us and a person will reply.",
  alternates: { canonical: "/contact/" },
};

const FAQ = [
  { q: "How quickly will you reply?", a: `${CONTACT.reply} If your message is about something that is stopping you from running an event, say so in the subject and we will look at it first.` },
  { q: "I would like to see Catering by Platterly. What should I do?", a: "Use the Talk to us page. A person will call you back, show you around and answer your questions. You can also create a free account and look around on your own for seven days." },
  { q: "I cannot sign in. Can you help?", a: "Use Forgot password on the sign-in page to get a one-time code by email. If that does not work, write to us from the email address on your account and tell us your kitchen name." },
  { q: "Where do I send a question about an invoice?", a: "Write to us from the email address on your account with the invoice number and your kitchen name, choosing Billing or an invoice as the subject." },
];

export default function ContactPage() {
  const channels = [
    { icon: Mail, title: "Email", value: CONTACT.email, href: `mailto:${CONTACT.email}`, note: CONTACT.reply },
    CONTACT.phone && { icon: Phone, title: "Phone", value: CONTACT.phone, href: `tel:${CONTACT.phone.replace(/\s/g, "")}`, note: "During business hours." },
    CONTACT.whatsapp && { icon: MessageCircle, title: "WhatsApp", value: CONTACT.whatsapp, href: `https://wa.me/${CONTACT.whatsapp.replace(/\D/g, "")}`, note: "Message us any time." },
    { icon: MapPin, title: "Address", value: CONTACT.addressLines.join(", "), href: undefined, note: "" },
  ].filter(Boolean) as { icon: typeof Mail; title: string; value: string; href?: string; note: string }[];
  return (
    <>
      <PageHero eyebrow="Contact us" title="We are here to help">
        <p>Questions, help with your account, or an idea for Catering by Platterly? Write to us and a person will reply.</p>
      </PageHero>
      <section aria-label="Ways to reach us" className="mx-auto w-full max-w-[1200px] px-5 pt-20 sm:px-8 md:pt-28">
        <Reveal as="ul" className="flex flex-wrap justify-center gap-4">
          {channels.map((c, i) => (
            <li key={c.title} style={{ "--d": `${i * 90}ms` } as React.CSSProperties} className="rv-child w-full rounded-[24px] bg-paper p-6 shadow-card sm:w-[calc(50%-0.5rem)] lg:w-[17.5rem]">
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent">
                <c.icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-5 text-xl font-medium">{c.title}</h2>
              {c.href ? (
                <a href={c.href} className="mt-1 block break-words text-slate-gray underline-offset-4 hover:underline">
                  {c.value}
                </a>
              ) : (
                <p className="mt-1 text-slate-gray">{c.value}</p>
              )}
              {c.note && <p className="mt-3 text-sm text-slate-gray">{c.note}</p>}
            </li>
          ))}
        </Reveal>
        {CONTACT.hours.length > 0 && (
          <div className="mt-4 flex items-start gap-4 rounded-[24px] bg-pebble p-6">
            <Clock className="mt-1 size-5 shrink-0" aria-hidden />
            <div>
              <h2 className="text-lg font-medium">Business hours</h2>
              <ul className="mt-1 text-slate-gray">
                {CONTACT.hours.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
      <div className="mx-auto w-full max-w-[860px] px-5 py-20 sm:px-8 md:py-28">
        <Reveal>
          <div className="rounded-[36px] bg-paper/40 p-2 ring-1 ring-ink-navy/10">
            <div className="rounded-[30px] bg-paper p-6 shadow-product sm:p-10">
              <h2 className="h-sub">Send us a message</h2>
              <p className="mb-8 mt-2 text-slate-gray">Tell us what you need and we will come back to you.</p>
              <EnquiryForm kind="contact" />
            </div>
          </div>
        </Reveal>
      </div>
      <section aria-labelledby="faq" className="mx-auto w-full max-w-[1200px] px-5 pb-24 sm:px-8 md:pb-32">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 id="faq" className="h-section">
            Before you write
          </h2>
        </Reveal>
        <Reveal className="mt-12" delay={100}>
          <Faq items={FAQ} />
        </Reveal>
      </section>
    </>
  );
}
