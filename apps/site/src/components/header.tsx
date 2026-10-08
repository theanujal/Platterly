"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { ProductTile } from "@/components/product-tile";
import { ButtonLink } from "@/components/ui";
import { MENUS, type NavLink } from "@/content/nav";
import { CATERING_PRODUCT } from "@/content/products";
import { SITE } from "@/content/site";

const TOP = "inline-flex min-h-10 items-center gap-1 rounded-button px-3 text-base font-medium text-ink-navy transition-colors duration-150 hover:bg-ink-navy/5";

/** Every link in a menu: the product entry gets its coloured tile, the rest are plain links. */
function MenuLink({ link, onDone, focusable }: { link: NavLink; onDone: () => void; focusable: boolean }) {
  const tab = focusable ? 0 : -1;
  const inner = link.product ? (
    <>
      <ProductTile product={CATERING_PRODUCT} className="size-9" iconClass="size-[18px]" />
      <span>
        <span className="block text-base font-medium">{link.label}</span>
        {link.text && <span className="block text-sm leading-snug text-slate-gray">{link.text}</span>}
      </span>
    </>
  ) : (
    <span className="block text-base font-medium">{link.label}</span>
  );
  const cls = `flex items-center gap-3 rounded-xl transition-colors duration-150 hover:bg-pebble ${link.product ? "p-3" : "px-3 py-2"}`;
  if (/^(https?:|mailto:)/.test(link.href))
    return (
      <a href={link.href} tabIndex={tab} onClick={onDone} className={cls}>
        {inner}
      </a>
    );
  return (
    <Link href={link.href} tabIndex={tab} onClick={onDone} className={cls}>
      {inner}
    </Link>
  );
}

/** The menus (Product, Resources) and the right-hand actions. Used by the page's own bar and by the floating bar. */
function NavBar({ open, setOpen, close, idPrefix }: { open: string | null; setOpen: (v: string | null) => void; close: () => void; idPrefix: string }) {
  return (
    <>
      <Link href="/" onClick={close} className="mr-4 flex shrink-0 items-center" aria-label="Platterly home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/platterly-logo.svg" alt="Platterly" width={150} height={34} className="h-8 w-auto" />
      </Link>
      <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
        {MENUS.map((menu) => {
          const key = `${idPrefix}-${menu.label}`;
          return (
            <div key={menu.label} className="relative" onMouseEnter={() => setOpen(key)} onMouseLeave={() => setOpen(open === key ? null : open)}>
              <button type="button" aria-expanded={open === key} aria-haspopup="true" onClick={() => setOpen(key)} className={TOP}>
                {menu.label} <ChevronDown className={`size-4 transition-transform duration-200 ${open === key ? "rotate-180" : ""}`} strokeWidth={2} aria-hidden />
              </button>
              <div data-open={open === key} className="invisible absolute left-0 top-full z-50 w-max translate-y-1 pt-2 opacity-0 transition duration-200 data-[open=true]:visible data-[open=true]:translate-y-0 data-[open=true]:opacity-100">
                <div className="flex gap-6 rounded-[20px] border border-hairline bg-paper p-5 shadow-product">
                  {menu.groups.map((group) => (
                    <div key={group.label} className="min-w-52 first:border-r first:border-hairline first:pr-6 last:pr-0 only:border-0">
                      <p className="eyebrow mb-3 px-3 text-slate-gray">{group.label}</p>
                      <ul>
                        {group.links.map((link) => (
                          <li key={link.label}>
                            <MenuLink link={link} onDone={close} focusable={open === key} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
      <div className="ml-auto hidden items-center gap-2 lg:flex">
        <Link href="/talk-to-us/" onClick={close} className={TOP}>
          Talk to us
        </Link>
        <ButtonLink href={SITE.appUrl} variant="outline">
          Log in
        </ButtonLink>
        <ButtonLink href={SITE.appUrl}>Get started for free</ButtonLink>
      </div>
    </>
  );
}

/**
 * Calendly's header. On a wide screen the page's own bar scrolls away with the page, and once you have scrolled past it a
 * floating white bar (24px from the top, 48px from the sides) carries the same menu and buttons. Below 1024px the bar
 * is a normal sticky one with a panel.
 */
export function Header() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [floating, setFloating] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const bars = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setMobile(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (bars.current && !bars.current.contains(e.target as Node)) setOpen(null);
    };
    const onScroll = () => {
      setFloating(window.scrollY > 160);
      setScrolled(window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const close = () => {
    setOpen(null);
    setMobile(false);
  };

  return (
    <div ref={bars}>
      <header className={`sticky top-0 z-40 bg-cloud transition-shadow duration-200 lg:relative lg:shadow-none ${scrolled ? "shadow-[0_1px_0_rgba(7,26,49,0.1)]" : ""}`}>
        <div className="flex h-[68px] w-full items-center gap-4 px-5 sm:px-12 lg:h-[72px]">
          <NavBar open={open} setOpen={setOpen} close={close} idPrefix="page" />
          <button
            type="button"
            className="ml-auto inline-flex size-10 items-center justify-center rounded-button text-ink-navy hover:bg-ink-navy/5 lg:hidden"
            aria-label={mobile ? "Close menu" : "Open menu"}
            aria-expanded={mobile}
            aria-controls="mobile-menu"
            onClick={() => setMobile((v) => !v)}
          >
            {mobile ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
          </button>
        </div>

        {mobile && (
          <div id="mobile-menu" className="menu-drop max-h-[calc(100vh-68px)] overflow-y-auto border-t border-hairline bg-cloud px-5 pb-8 pt-3 lg:hidden">
            <nav aria-label="Mobile" className="flex flex-col">
              {MENUS.map((menu) => (
                <div key={menu.label} className="border-b border-hairline py-3">
                  <p className="eyebrow px-2 pb-1 pt-2 text-slate-gray">{menu.label}</p>
                  {menu.groups.flatMap((group) => group.links).map((link) => (
                      <Link key={link.label} href={link.href} onClick={close} className="block rounded-button px-2 py-2.5 text-lg font-medium">
                        {link.label}
                      </Link>
                  ))}
                </div>
              ))}
              <div className="mt-6 flex flex-col gap-3">
                <ButtonLink href={SITE.appUrl} variant="outline">
                  Log in
                </ButtonLink>
                <ButtonLink href={SITE.appUrl}>Get started for free</ButtonLink>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* The floating bar: only from 1024px up, only once the page's own bar has scrolled away. */}
      <div
        aria-hidden={!floating}
        data-visible={floating}
        className="floating-nav pointer-events-none invisible fixed inset-x-12 top-6 z-50 hidden -translate-y-3 opacity-0 transition duration-300 data-[visible=true]:pointer-events-auto data-[visible=true]:visible data-[visible=true]:translate-y-0 data-[visible=true]:opacity-100 lg:block"
      >
        <div className="flex h-[72px] items-center gap-4 rounded-[20px] bg-paper px-4 shadow-product">
          <NavBar open={open} setOpen={setOpen} close={close} idPrefix="float" />
        </div>
      </div>
    </div>
  );
}
