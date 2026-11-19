import { Reveal } from "@/components/reveal";
import { ScreenPanel } from "@/components/screen-panel";
import type { UiCardName } from "@/components/ui-cards";

export interface Step {
  title: string;
  text: string;
  points: readonly string[];
}

/** What each card shows: its own colourway, a piece of the real screen, and an icon. Matched to the steps by position. */
const LOOKS: readonly { way: string; card: UiCardName; crop: string; screen?: { file: string; alt: string } }[] = [
  { way: "sunrise", card: "orders", crop: "-left-[66%] -top-[110%] w-[330%]", screen: { file: "orders", alt: "The Orders page in Caterly: each order with its customer, event, guests, amount and status" } },
  { way: "blossom", card: "kitchen", crop: "-left-[66%] -top-[36%] w-[330%]" },
  { way: "dusk", card: "payment", crop: "-left-[66%] -top-[28%] w-[330%]", screen: { file: "dashboard", alt: "The Caterly dashboard: orders pending, in the kitchen and completed, with pending revenue and order value" } },
];

/**
 * Three equal cards in one row (one under another below 1024px). Each has a coloured panel at the top holding the real
 * screen from the product, cropped by the panel's right and lower edges; below it an icon, the title, and one line. Nothing depends on hover,
 * so touch and keyboard readers see the same thing.
 */
export function StepCards({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="mt-14 grid gap-5 lg:grid-cols-3 lg:gap-6">
      {steps.map((step, index) => {
        const look = LOOKS[index % LOOKS.length];
        return (
          <Reveal as="li" key={step.title} delay={index * 90} className="group flex flex-col rounded-[32px] bg-paper p-3 shadow-product transition-transform duration-300 ease-calendly motion-safe:hover:-translate-y-1">
            <ScreenPanel name={look.card} way={look.way} screen={look.screen} crop={look.crop} className="h-64 rounded-[24px]" />
            <div className="flex flex-1 flex-col px-4 pb-5 pt-6 sm:px-5">
              <h3 className="h-sub !text-[1.75rem]">{step.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-slate-gray">{step.text}</p>
            </div>
          </Reveal>
        );
      })}
    </ol>
  );
}
