import { Reveal } from "@/components/reveal";

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  business: string;
}

/**
 * Customer words, shown only when there are real ones. The list is empty until a customer has agreed to be quoted; an
 * empty list renders nothing, so no placeholder or invented quote can ship by accident.
 */
export function Voices({ items }: { items: readonly Testimonial[] }) {
  if (items.length === 0) return null;
  const [lead, ...rest] = items;
  return (
    <section aria-label="What customers say">
      <div className="mx-auto grid w-full max-w-[1200px] gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[1.3fr_1fr]">
        <Reveal>
          <blockquote>
            <p className="h-sub !text-[clamp(1.5rem,3vw,2.25rem)] !font-bold !leading-snug">“{lead.quote}”</p>
            <footer className="mt-6 text-lg text-slate-gray">
              <strong className="text-ink-navy">{lead.name}</strong>, {lead.role}, {lead.business}
            </footer>
          </blockquote>
        </Reveal>
        <Reveal delay={120} className="flex flex-col gap-8 lg:border-l lg:border-hairline lg:pl-12">
          {rest.map((item) => (
            <blockquote key={item.name}>
              <p className="text-lg leading-relaxed">“{item.quote}”</p>
              <footer className="mt-3 text-base text-slate-gray">
                <strong className="text-ink-navy">{item.name}</strong>, {item.business}
              </footer>
            </blockquote>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
