import { Icon } from "@/components/icons";
import { ProductTile } from "@/components/product-tile";
import { Reveal } from "@/components/reveal";
import { ScreenPanel } from "@/components/screen-panel";
import { ButtonLink } from "@/components/ui";
import { productVars, type Product } from "@/content/products";
import type { ShowcaseItem } from "@/components/feature-showcase";

/**
 * The home page's chapter about the product: a label, a heading, one line, a compact list of what it covers and one picture
 * of the real screen. Nothing opens, slides or changes by itself.
 */
export function ProductChapter({ id, label, product, title, subtitle, items, href, cta, screen }: { id: string; label: string; product: Product; title: string; subtitle: string; items: readonly ShowcaseItem[]; href: string; cta: string; screen: ShowcaseItem["card"] }) {
  return (
    <section aria-labelledby={id} style={productVars(product)} className="mx-auto w-full max-w-[1328px] px-5 py-12 sm:px-8 md:py-16">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal from="left">
          <p className="inline-flex items-center gap-2 text-sm font-medium">
            <ProductTile product={product} className="size-6 !rounded-md !text-white" iconClass="size-4" />
            {label}
          </p>
          <h2 id={id} className="h-serif mt-3 !text-[2rem] !leading-[1.1] sm:!text-[2.5rem]">
            {title}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-gray sm:text-lg">{subtitle}</p>
          <ul className="mt-7 flex flex-col gap-3.5">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 text-base font-medium">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-product-tint text-ink-navy">
                  <Icon name={item.icon} className="size-4" />
                </span>
                {item.title}
              </li>
            ))}
          </ul>
          <div className="mt-7">
            <ButtonLink href={href}>{cta}</ButtonLink>
          </div>
        </Reveal>
        <Reveal from="scale" delay={100}>
          <ScreenPanel name={screen} way="sunrise" className="aspect-[4/3] w-full rounded-[32px] sm:rounded-[56px] lg:aspect-auto lg:h-[28rem]" />
        </Reveal>
      </div>
    </section>
  );
}
