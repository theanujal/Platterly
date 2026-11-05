"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BUSINESS, initials, LINK_LABEL, PRODUCTS } from "@/lib/account/mock-data";
import { selectedProduct } from "@/lib/account/state";
import { Icon, type IconName } from "./icons";
import { dispatch, useAccount } from "./store";
import { Avatar, Badge } from "./ui";
import "./account.css";

/** `prefix` is the leading "My " of a page name; it is hidden on a phone so five tabs fit the bottom bar. */
/** `hidden` pages are not shown in the sidebar but still have a title for the header. */
const NAV: { href: string; prefix?: string; label: string; title: string; icon: IconName; hidden?: boolean }[] = [
  { href: "/", label: "Overview", title: "Overview", icon: "home" },
  { href: "/business", prefix: "My ", label: "Business", title: "My Business", icon: "building", hidden: true },
  { href: "/products", prefix: "My ", label: "Products", title: "My Products", icon: "grid" },
  { href: "/profile", prefix: "My ", label: "Profile", title: "My Profile", icon: "user" },
  { href: "/security", label: "Security", title: "Security", icon: "shield" },
];

const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** The Account header: where you are, a plain statement that the data is sample data, and who the account holder is. */
function AccountHeader() {
  const pathname = usePathname();
  const { profile } = useAccount();
  const here = NAV.find((item) => isActive(item.href, pathname));
  return (
    <header className="pa-topbar">
      <nav className="pa-crumbs" aria-label="Breadcrumb">
        <span>Account</span>
        <Icon name="chevronRight" size={14} />
        <span aria-current="page">{here?.title ?? "Account"}</span>
      </nav>
      <div className="pa-topbar-right">
        <Badge tone="warning">Sample data</Badge>
        <Link href="/profile" className="pa-acct-chip" aria-label="Your profile">
          <Avatar label={initials(profile.fullName)} size="sm" round />
          <span className="pa-acct-chip-name">{profile.fullName}</span>
        </Link>
      </div>
    </header>
  );
}

/** The product picker: one account, one business, several products. Picking one only changes local state in this prototype. */
function ProductSwitcher() {
  const account = useAccount();
  const current = selectedProduct(account);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const sub = (id: string) => (id === "caterly" ? LINK_LABEL[account.caterly.status] : "Coming soon");

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="pa-switcher" ref={root}>
      <button type="button" className="pa-switcher-btn" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={`Product: ${current.name}. Switch product`} onClick={() => setOpen((v) => !v)}>
        <Avatar label={current.initial} size="sm" />
        <span className="pa-switcher-text">
          <span className="pa-switcher-cap">{BUSINESS.name}</span>
          <span className="pa-switcher-name">{current.name}</span>
        </span>
        <Icon name="chevronDown" size={16} className="pa-switcher-chev" />
      </button>
      {open && (
        <ul className="pa-switcher-list" id={listId} role="listbox" aria-label="Your products">
          {PRODUCTS.map((p) => (
            <li key={p.id} role="option" aria-selected={p.id === current.id}>
              <button
                type="button"
                className="pa-switcher-opt"
                onClick={() => {
                  dispatch({ type: "selectProduct", id: p.id });
                  setOpen(false);
                }}
              >
                <Avatar label={p.initial} size="sm" />
                <span className="pa-switcher-text">
                  <span className="pa-switcher-name">{p.name}</span>
                  <span className="pa-switcher-cap">{sub(p.id)}</span>
                </span>
                {p.id === current.id && <Icon name="check" size={16} className="pa-switcher-tick" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile } = useAccount();

  return (
    <div className="pa-root">
      <aside className="pa-side">
        <Link href="/" className="pa-brand" aria-label="Platterly Account">
          <span className="pa-brand-mark" aria-hidden="true">
            P
          </span>
          <span className="pa-brand-name">Platterly</span>
        </Link>
        <ProductSwitcher />
        <nav className="pa-nav" aria-label="Account">
          {NAV.filter((item) => !item.hidden).map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <Link key={item.href} href={item.href} className="pa-nav-item" aria-current={active ? "page" : undefined}>
                <Icon name={item.icon} size={18} />
                <span>
                  {item.prefix && <span className="pa-nav-prefix">{item.prefix}</span>}
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="pa-side-foot">
          <Link href="/profile" className="pa-user" aria-label="Your profile">
            <Avatar label={initials(profile.fullName)} size="sm" round />
            <span className="pa-user-text">
              <span className="pa-user-name">{profile.fullName}</span>
              <span className="pa-user-mail">{profile.email}</span>
            </span>
          </Link>
          <p className="pa-proto-note">Prototype with sample data. Nothing is saved to a server.</p>
        </div>
      </aside>
      <div className="pa-content">
        <AccountHeader />
        <main className="pa-main">{children}</main>
      </div>
    </div>
  );
}
