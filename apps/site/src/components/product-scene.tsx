import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { ProductTile } from "@/components/product-tile";
import { productVars, type Product } from "@/content/products";

/** What the card says and shows. */
function SceneCard({ product, title, text, visual }: { product: Product; title: string; text: string; visual: ReactNode }) {
  return (
    <div className="grid items-center gap-8 rounded-[28px] bg-cloud p-4 shadow-product sm:rounded-[36px] sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-10 [&>*]:min-w-0">
      <div className="flex flex-col items-start gap-4">
        <p className="inline-flex items-center gap-2 text-base font-medium">
          <ProductTile product={product} className="size-6 !rounded-md" iconClass="size-4" />
          {product.name}
        </p>
        <h2 className="h-sub !text-[clamp(1.75rem,2.6vw,2.5rem)] !leading-[1.1]">{title}</h2>
        <p className="text-lg leading-relaxed text-slate-gray">{text}</p>
        <Link href={product.href} className="inline-flex items-center gap-2 border-b border-ink-navy pb-0.5 text-base font-medium transition-colors duration-150 hover:border-transparent">
          Learn more <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="min-w-0 rounded-[24px] bg-product-tint p-2 sm:p-6">{visual}</div>
    </div>
  );
}

/**
 * The home page's product card, after calendly.com's: a strip with the product's icon (in its own colour) and a dashed
 * "+" that marks the room for more products, joined to one white card that says what the product is. It sits on the
 * hero's gradient and does not move.
 */
export function ProductScene({ product, title, text, visual }: { product: Product; title: string; text: string; visual: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-6 sm:px-10" style={productVars(product)}>
      <div className="flex items-end justify-center gap-2" role="group" aria-label="Products">
        <span className="relative flex size-14 items-center justify-center rounded-[20px] bg-paper">
          <ProductTile product={product} className="size-12 !rounded-[16px]" iconClass="size-6" />
          <span aria-hidden className="absolute -bottom-3 left-1/2 h-4 w-5 -translate-x-1/2 rounded-b-lg bg-paper" />
        </span>
        <span className="flex size-14 items-center justify-center rounded-[20px] border-2 border-dashed border-ink-navy/40 text-ink-navy/70" title="More products are on the way">
          <Plus className="size-5" aria-hidden />
          <span className="sr-only">More products are on the way</span>
        </span>
      </div>
      <div className="relative mt-2">
        <SceneCard product={product} title={title} text={text} visual={visual} />
      </div>
    </div>
  );
}
