"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { initials, LINK_LABEL, PRODUCTS } from "@/lib/account/catalogue";
import { selectedProduct } from "@/lib/account/state";
import { AccountDataProvider, useAccountData } from "./data";
import { Icon, type IconName } from "./icons";
import { dispatch, useAccount } from "./store";
import { Avatar } from "./ui";
import "./account.css";

/** `prefix` is the leading "My " of a page name; it is hidden on a phone so five tabs fit the bottom bar. */
/** `hidden` pages are not shown in the sidebar but still have a title for the header. */
const NAV: { href: string; prefix?: string; label: string; title: string; icon: IconName; hidden?: boolean }[] = [
  { href: "/", label: "Overview", title: "Overview", icon: "home" },
  { href: "/products", prefix: "My ", label: "Products", title: "My Products", icon: "grid" },
  { href: "/invoices", label: "Invoices", title: "Invoices", icon: "receipt" },
  { href: "/subscriptions", label: "Subscriptions", title: "Subscriptions", icon: "card" },
  { href: "/payment-methods", label: "Payment method", title: "Payment method", icon: "card" },
  { href: "/billing-details", label: "Billing details", title: "Billing details", icon: "building" },
  { href: "/profile", prefix: "My ", label: "Profile", title: "My Profile", icon: "user" },
  { href: "/security", label: "Security", title: "Security", icon: "shield" },
  { href: "/devices", label: "Devices", title: "Devices and activity", icon: "globe" },
  { href: "/notifications", label: "Notifications", title: "Notifications", icon: "bell" },
];

const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Who the shell says is signed in, from the real data: the email, a placeholder while loading, or "Not signed in". */
function useWho() {
  const data = useAccountData();
  if (data.phase === "ready") return { label: initials(data.overview.user.name ?? data.overview.user.email), name: data.overview.user.name ?? data.overview.user.email, sub: data.overview.user.emailVerified ? "Email verified" : "Email not verified" };
  if (data.phase === "unauthenticated") return { label: "?", name: "Not signed in", sub: "Sign in to see your account" };
  if (data.phase === "error") return { label: "!", name: "Account unavailable", sub: "Could not load" };
  return { label: "…", name: "Loading", sub: "" };
}

/** The Account header: where you are and who the account holder is. */
function AccountHeader() {
  const pathname = usePathname();
  const who = useWho();
  const here = NAV.find((item) => isActive(item.href, pathname));
  return (
    <header className="pa-topbar">
      <nav className="pa-crumbs" aria-label="Breadcrumb">
        <span>Account</span>
        <Icon name="chevronRight" size={14} />
        <span aria-current="page">{here?.title ?? "Account"}</span>
      </nav>
      <div className="pa-topbar-right">
        <Link href="/profile" className="pa-acct-chip" aria-label="Your profile">
          <Avatar label={who.label} size="sm" round />
          <span className="pa-acct-chip-name">{who.name}</span>
        </Link>
      </div>
    </header>
  );
}

/** The product picker: one account, one business, several products. Picking one only changes local state in this prototype. */
function ProductSwitcher() {
  const account = useAccount();
  const current = selectedProduct(account);
  const data = useAccountData();
  const caption = data.phase === "ready" ? (data.overview.business.state === "ok" ? data.overview.business.business.name : data.overview.business.state === "none" ? "No business yet" : "No access") : data.phase === "unauthenticated" ? "Not signed in" : data.phase === "loading" ? "Loading" : "Unavailable";
  const caterlyLink = data.phase === "ready" && data.overview.business.state === "ok" ? LINK_LABEL[data.overview.business.products.caterly] : "—";
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const sub = (id: string) => (id === "caterly" ? caterlyLink : "Coming soon");

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
          <span className="pa-switcher-cap">{caption}</span>
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
  return (
    <AccountDataProvider>
      <ShellFrame>{children}</ShellFrame>
    </AccountDataProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const who = useWho();
  const signedIn = useAccountData().phase === "ready";

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
            <Avatar label={who.label} size="sm" round />
            <span className="pa-user-text">
              <span className="pa-user-name">{who.name}</span>
              <span className="pa-user-mail">{who.sub}</span>
            </span>
          </Link>
          {signedIn && (
            <form method="post" action="/auth/signout">
              <button type="submit" className="pa-btn pa-btn-outline">
                <Icon name="logout" size={15} /> Sign out
              </button>
            </form>
          )}
        </div>
      </aside>
      <div className="pa-content">
        <AccountHeader />
        <main className="pa-main">{children}</main>
      </div>
    </div>
  );
}
