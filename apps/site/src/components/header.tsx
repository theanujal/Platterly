"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { ProductTile } from "@/components/product-tile";
import { ButtonLink } from "@/components/ui";
import { MENUS, type NavLink } from "@/content/nav";
import { CATERING_PRODUCT } from "@/content/products";
import { SITE } from "@/content/site";
import { useHeaderSession, type HeaderSession } from "@/lib/header-session";

const TOP = "inline-flex min-h-9 items-center gap-1 rounded-button px-3 text-base font-medium text-ink-navy transition-colors duration-150 hover:bg-ink-navy/5";

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


type SignedIn = Extract<HeaderSession, { status: "signed_in" }>;

/** The person's circle: their photo, or their initials in the same soft peach as the product tiles. */
function Avatar({ person }: { person: SignedIn }) {
  const [broken, setBroken] = useState(false);
  return person.photoUrl && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.photoUrl} alt="" width={40} height={40} onError={() => setBroken(true)} className="size-10 rounded-full object-cover ring-1 ring-brand/20" />
  ) : (
    <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-badge-fill text-sm font-semibold text-ink-navy ring-1 ring-brand/20">
      {person.initials}
    </span>
  );
}

const CIRCLE = "inline-flex size-10 items-center justify-center rounded-full outline-none transition-shadow duration-150 hover:shadow-[0_0_0_4px_rgba(255,105,0,0.12)] focus-visible:ring-2 focus-visible:ring-ink-navy";

/**
 * One product: the circle opens its dashboard. Several: the circle opens a menu with every product (each opens that product's dashboard) and the Account. None
 * yet: the circle opens the Account. (Signing out is done in the Account: the Platform only accepts it from its own pages.)
 */
function AccountCircle({ person, open, setOpen, close }: { person: SignedIn; open: string | null; setOpen: (v: string | null) => void; close: () => void }) {
  const [only] = person.products;
  if (person.products.length <= 1) {
    const href = only?.openUrl ?? person.accountUrl;
    return (
      <a href={href} aria-label={only ? `Open ${only.name}` : "Open your Account"} title={only ? `Open ${only.name}` : "Your Account"} className={CIRCLE}>
        <Avatar person={person} />
      </a>
    );
  }
  const on = open === "account";
  return (
    <div className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={on} aria-label={`${person.name}: your products`} onClick={() => setOpen(on ? null : "account")} className={CIRCLE}>
        <Avatar person={person} />
      </button>
      <div data-open={on} className="invisible absolute right-0 top-full z-50 w-72 translate-y-1 pt-3 opacity-0 transition duration-200 data-[open=true]:visible data-[open=true]:translate-y-0 data-[open=true]:opacity-100">
        <div role="menu" className="rounded-[20px] border border-hairline bg-paper p-3 shadow-product">
          <p className="eyebrow px-3 pb-2 pt-1 text-slate-gray">Your products</p>
          <ul>
            {person.products.map((product) => (
              <li key={product.key}>
                <a role="menuitem" tabIndex={on ? 0 : -1} href={product.openUrl} onClick={close} className="flex items-center gap-3 rounded-xl p-2 transition-colors duration-150 hover:bg-badge-fill">
                  <ProductMark productKey={product.key} />
                  <span>
                    <span className="block text-base font-medium">{product.name}</span>
                    <span className="block text-sm text-slate-gray">Open dashboard</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <a role="menuitem" tabIndex={on ? 0 : -1} href={person.accountUrl} onClick={close} className="mt-2 flex items-center rounded-xl border-t border-hairline px-3 pb-2 pt-3 text-base font-medium transition-colors duration-150 hover:bg-badge-fill">
            Your Account
          </a>
        </div>
      </div>
    </div>
  );
}

/** Caterly's own mark; any other product gets a plain peach tile with its first letter until it has one. */
function ProductMark({ productKey }: { productKey: string }) {
  return productKey === "caterly" ? (
    <ProductTile product={CATERING_PRODUCT} className="size-9 shrink-0" iconClass="size-[18px]" />
  ) : (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-badge-fill text-base font-semibold ring-1 ring-brand/20">
      {productKey[0]?.toUpperCase()}
    </span>
  );
}

/** The right-hand end of the pill. Not signed in: Contact Sales and Get Started. Signed in: Contact Support and the person's circle. */
function Actions({ open, setOpen, close }: { open: string | null; setOpen: (v: string | null) => void; close: () => void }) {
  const session = useHeaderSession();
  return (
    <div className="ml-auto hidden items-center gap-1 lg:flex">
      {session.status === "signed_in" ? (
        <>
          <Link href="/contact/" onClick={close} className={TOP}>
            Contact Support
          </Link>
          <AccountCircle person={session} open={open} setOpen={setOpen} close={close} />
        </>
      ) : (
        <>
          <Link href="/talk-to-us/" onClick={close} className={TOP}>
            Contact Sales
          </Link>
          <ButtonLink href={SITE.appUrl} className="!min-h-10 !rounded-full !px-5 !py-1.5">
            Get Started
          </ButtonLink>
        </>
      )}
    </div>
  );
}

/** The same choices inside the phone menu. */
function MobileActions() {
  const session = useHeaderSession();
  if (session.status === "signed_in")
    return (
      <div className="mt-6 flex flex-col gap-3">
        {session.products.map((product) => (
          <ButtonLink key={product.key} href={product.openUrl} className="!rounded-full">
            Open {product.name}
          </ButtonLink>
        ))}
        <ButtonLink href={session.accountUrl} variant="outline" className="!rounded-full">
          Your Account
        </ButtonLink>
        <ButtonLink href="/contact/" variant="outline" className="!rounded-full">
          Contact Support
        </ButtonLink>
      </div>
    );
  return (
    <div className="mt-6 flex flex-col gap-3">
      <ButtonLink href="/talk-to-us/" variant="outline" className="!rounded-full">
        Contact Sales
      </ButtonLink>
      <ButtonLink href={SITE.appUrl} className="!rounded-full">
        Get Started
      </ButtonLink>
    </div>
  );
}

/** The menus (Product, Resources) and the right-hand actions. Used by the page's own bar and by the floating bar. */
function NavBar({ open, setOpen, close, idPrefix }: { open: string | null; setOpen: (v: string | null) => void; close: () => void; idPrefix: string }) {
  return (
    <>
      <Link href="/" onClick={close} className="mr-2 flex shrink-0 items-center" aria-label="Platterly home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/platterly-logo.svg" alt="Platterly" width={150} height={34} className="h-7 w-auto" />
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
      <Actions open={open} setOpen={setOpen} close={close} />
    </>
  );
}

/**
 * The header is one white pill that floats over the top of the page, on the hero's gradient, and stays in view as the page
 * scrolls (the hero starts at the very top: the pill takes no room of its own). Below 1024px the pill holds the logo and a
 * menu button, and the menu opens as a card under it.
 */
export function Header() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
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
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const close = () => {
    setOpen(null);
    setMobile(false);
  };

  return (
    <div ref={bars} className="sticky top-0 z-50 h-0">
      <header className="absolute inset-x-0 top-4 mx-auto w-[calc(100%-24px)] max-w-[920px] sm:w-[calc(100%-48px)]">
        <div className="flex h-14 items-center gap-3 rounded-full bg-paper/95 pl-5 pr-2 shadow-product ring-1 ring-ink-navy/5 backdrop-blur">
          <NavBar open={open} setOpen={setOpen} close={close} idPrefix="page" />
          <button
            type="button"
            className="ml-auto inline-flex size-10 items-center justify-center rounded-full text-ink-navy hover:bg-ink-navy/5 lg:hidden"
            aria-label={mobile ? "Close menu" : "Open menu"}
            aria-expanded={mobile}
            aria-controls="mobile-menu"
            onClick={() => setMobile((v) => !v)}
          >
            {mobile ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
          </button>
        </div>

        {mobile && (
          <div id="mobile-menu" className="menu-drop mt-2 max-h-[calc(100vh-96px)] overflow-y-auto rounded-[28px] bg-paper px-5 pb-6 pt-2 shadow-product ring-1 ring-ink-navy/5 lg:hidden">
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
              <MobileActions />
            </nav>
          </div>
        )}
      </header>
    </div>
  );
}
