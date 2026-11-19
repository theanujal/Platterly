import Link from "next/link";
import { ClipboardList, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react";
import { ArrowRight } from "@/components/icons";
import { Reveal } from "@/components/reveal";

/** Four plain facts, each one taken from the Security page (src/content/pages/security.md). Nothing here is a claim that page does not make. */
const POINTS: readonly { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ShieldCheck, title: "Your data stays separate", text: "Every business is its own account. What one records is never visible to another." },
  { icon: Users, title: "You decide who sees what", text: "Roles for sales, kitchen, store and accounts limit what each person can see and change." },
  { icon: Wallet, title: "Payments go through Razorpay", text: "Card, UPI and bank details are never stored by Platterly." },
  { icon: ClipboardList, title: "A record of every change", text: "Important actions are logged with who did them and when." },
];

/** The home page's trust band: one line, four facts and a link to the full Security page. */
export function TrustStrip() {
  return (
    <section aria-labelledby="trust" className="mx-auto w-full max-w-[1328px] px-5 py-12 sm:px-8 md:py-16">
      <Reveal className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Security</p>
          <h2 id="trust" className="h-section mt-3 !text-[2rem] sm:!text-[2.5rem]">
            Your kitchen&apos;s data, kept safe
          </h2>
        </div>
        <Link href="/security/" className="inline-flex items-center gap-2 border-b border-ink-navy pb-0.5 text-base font-medium transition-colors duration-150 hover:border-transparent">
          How we keep it safe <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Reveal>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map((point, i) => (
          <Reveal as="li" key={point.title} delay={i * 70} className="rounded-[24px] bg-paper p-6 shadow-product ring-1 ring-ink-navy/5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-badge-fill ring-1 ring-brand/15 text-ink-navy">
              <point.icon className="size-5" strokeWidth={2} aria-hidden />
            </span>
            <h3 className="h-sub mt-4 !text-[1.375rem]">{point.title}</h3>
            <p className="mt-2 text-base leading-relaxed text-slate-gray">{point.text}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
