"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { ProductTile } from "@/components/product-tile";
import { Stage } from "@/components/stage";
import { productVars, type Product } from "@/content/products";

/** The aurora behind the card: warm peach with rose, lilac and mint, like calendly.com's soft colour fields. */
const SKY = "var(--aurora)";
const HOLD_VH = 60;

/** What the card says and shows. Used by the pinned scene and by the plain fallback, so both read the same. */
function SceneCard({ product, title, text, visual }: { product: Product; title: string; text: string; visual: ReactNode }) {
  return (
    <div className="grid items-center gap-8 rounded-[28px] bg-cloud p-6 shadow-product sm:rounded-[36px] sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-10">
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
      <div className="rounded-[24px] bg-product-tint p-4 sm:p-6">{visual}</div>
    </div>
  );
}

/**
 * The home page's product scene, after calendly.com's. It starts as a card under the headline; as you scroll it grows
 * until it fills the screen (24px in from every edge), holds there for a moment, and lets go. One card says what the
 * product is; the product's icon is in its own colour and a dashed "+" marks the room for more products. An X skips it.
 *
 * Only used on a wide, tall screen with scripts on and motion allowed (see .scene-pinned in globals.css); everywhere
 * else the same card shows in a plain gradient panel.
 */
export function ProductScene({ product, title, text, visual }: { product: Product; title: string; text: string; visual: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const clip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (el.offsetParent === null) return;
      const vh = window.innerHeight;
      const rect = el.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, 1 - (rect.top - 24) / (vh * 0.7)));
      const eased = 1 - Math.pow(1 - t, 3);
      const side = ((el.clientWidth - Math.min(el.clientWidth, 1200)) / 2) * (1 - eased);
      if (clip.current) clip.current.style.clipPath = `inset(0 ${side}px 0 ${side}px round 44px)`;
      document.documentElement.dataset.pinned = String(rect.top <= 24 && rect.bottom > vh - 24);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
      delete document.documentElement.dataset.pinned;
    };
  }, []);

  function skip() {
    const el = wrap.current;
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().bottom + window.scrollY - 24, behavior: "smooth" });
  }

  return (
    <>
      <div className="scene-static mx-auto max-w-[1200px] px-4 pb-6 sm:px-10">
        <Stage style={productVars(product)} className="p-3 sm:p-12">
          <SceneCard product={product} title={title} text={text} visual={visual} />
        </Stage>
      </div>

      <div ref={wrap} className="scene-pinned relative" style={{ height: `calc(${HOLD_VH}vh + 100vh - 48px)`, ...productVars(product) }}>
        <div className="sticky top-6 h-[calc(100vh-48px)]">
          <div ref={clip} className="absolute inset-0 overflow-hidden" style={{ clipPath: "inset(0 0 0 0 round 44px)", background: SKY }}>
            <button type="button" onClick={skip} aria-label="Skip the product scene" className="absolute right-12 top-12 z-10 flex size-12 items-center justify-center rounded-xl border border-paper/60 bg-paper/30 text-ink-navy transition-colors duration-150 hover:bg-paper/60">
              <X className="size-5" aria-hidden />
            </button>
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
              <div className="relative z-10 flex items-end gap-2" role="group" aria-label="Products">
                <span className="relative flex size-14 items-center justify-center rounded-[20px] bg-paper">
                  <ProductTile product={product} className="size-12 !rounded-[16px]" iconClass="size-6" />
                  <span aria-hidden className="absolute -bottom-3 left-1/2 h-4 w-5 -translate-x-1/2 rounded-b-lg bg-paper" />
                </span>
                <span className="flex size-14 items-center justify-center rounded-[20px] border-2 border-dashed border-ink-navy/40 text-ink-navy/70" title="More products are on the way">
                  <Plus className="size-5" aria-hidden />
                  <span className="sr-only">More products are on the way</span>
                </span>
              </div>
              <div className="relative mt-2 w-full max-w-[1000px]">
                <SceneCard product={product} title={title} text={text} visual={visual} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
