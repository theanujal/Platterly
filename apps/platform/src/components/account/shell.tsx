"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { initials } from "@/lib/account/catalogue";
import { AccountDataProvider, useAccountData } from "./data";
import { Icon, type IconName } from "./icons";
import { Avatar } from "./ui";
import "./account.css";

/** Platterly's public site, where help lives (the same address the Store's Help link uses). */
export const HELP_URL = "https://platterly.in/contact/";

/** `prefix` is the leading "My " of a page name. `hidden` pages are not shown in the sidebar but still have a title for the header. A `divider` starts the second group. */
const NAV: { href: string; prefix?: string; label: string; title: string; icon: IconName; hidden?: boolean; divider?: boolean }[] = [
  { href: "/", label: "Overview", title: "Overview", icon: "home" },
  { href: "/products", prefix: "My ", label: "Products", title: "My Products", icon: "grid" },
  { href: "/subscriptions", label: "Subscriptions", title: "Subscriptions", icon: "layers" },
  { href: "/invoices", label: "Invoices", title: "Invoices", icon: "receipt" },
  { href: "/payment-methods", label: "Payment Methods", title: "Payment Methods", icon: "card" },
  { href: "/billing-details", label: "Billing Details", title: "Billing Details", icon: "building" },
  { href: "/profile", prefix: "My ", label: "Profile", title: "My Profile", icon: "user", divider: true },
  { href: "/security", label: "Security", title: "Security", icon: "shield" },
  { href: "/devices", label: "Devices", title: "Devices and activity", icon: "monitor" },
  { href: "/notifications", label: "Notifications", title: "Notifications", icon: "bell" },
];

const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Who the shell says is signed in, from the real data: the email, a placeholder while loading, or "Not signed in". */
function useWho() {
  const data = useAccountData();
  if (data.phase === "ready") return { label: initials(data.overview.user.name ?? data.overview.user.email), name: data.overview.user.name ?? data.overview.user.email, sub: data.overview.user.emailVerified ? "Email verified" : "Email not verified", business: data.overview.business.state === "ok" ? data.overview.business.business.name : null };
  if (data.phase === "unauthenticated") return { label: "?", name: "Not signed in", sub: "Sign in to see your account", business: null };
  if (data.phase === "error") return { label: "!", name: "Account unavailable", sub: "Could not load", business: null };
  return { label: "…", name: "Loading", sub: "", business: null };
}

/** The name at the top right: a small menu with the pages about the person and Sign out. */
function UserMenu() {
  const who = useWho();
  const signedIn = useAccountData().phase === "ready";
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

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
    <div className="pa-usermenu" ref={root}>
      <button type="button" className="pa-acct-chip" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} aria-label="Account menu" onClick={() => setOpen((v) => !v)}>
        <span className="pa-acct-chip-name">
          <strong>{who.name}</strong>
          <small>{who.business ?? who.sub}</small>
        </span>
        <Avatar label={who.label} size="sm" round />
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="pa-menu" id={menuId} role="menu" aria-label="Account menu">
          <Link href="/profile" role="menuitem" className="pa-menu-item" onClick={() => setOpen(false)}>
            <Icon name="user" size={16} /> My Profile
          </Link>
          <Link href="/security" role="menuitem" className="pa-menu-item" onClick={() => setOpen(false)}>
            <Icon name="shield" size={16} /> Security
          </Link>
          {signedIn && (
            <form method="post" action="/auth/signout">
              <button type="submit" role="menuitem" className="pa-menu-item">
                <Icon name="logout" size={16} /> Sign out
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

const LeafCrumb = createContext<{ leaf: string | null; setLeaf: (label: string | null) => void }>({ leaf: null, setLeaf: () => {} });
/** A page under a menu page (a product's details) names itself for the last step of the breadcrumb. */
export function useLeafCrumb(label: string | null) {
  const { setLeaf } = useContext(LeafCrumb);
  useEffect(() => {
    setLeaf(label);
    return () => setLeaf(null);
  }, [label, setLeaf]);
}

/** The Account header: where you are, Help, and who the account holder is. */
function AccountHeader({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const pathname = usePathname();
  const { leaf } = useContext(LeafCrumb);
  const here = NAV.find((item) => isActive(item.href, pathname));
  const nested = leaf !== null && pathname !== here?.href;
  return (
    <header className="pa-topbar">
      <button type="button" className="pa-menu-btn" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="pa-side" onClick={onMenu}>
        <Icon name="menu" size={20} />
      </button>
      <nav className="pa-crumbs" aria-label="Breadcrumb">
        <span>Account</span>
        <Icon name="chevronRight" size={14} />
        {nested && here ? (
          <>
            <Link href={here.href}>{here.title}</Link>
            <Icon name="chevronRight" size={14} />
            <span aria-current="page">{leaf}</span>
          </>
        ) : (
          <span aria-current="page">{here?.title ?? "Account"}</span>
        )}
      </nav>
      <div className="pa-topbar-right">
        <a href={HELP_URL} className="pa-help-btn" target="_blank" rel="noopener noreferrer" aria-label="Help" title="Help">
          <Icon name="helpCircle" size={20} />
        </a>
        <UserMenu />
      </div>
    </header>
  );
}

function LeafCrumbProvider({ children }: { children: ReactNode }) {
  const [leaf, setLeaf] = useState<string | null>(null);
  return <LeafCrumb.Provider value={{ leaf, setLeaf }}>{children}</LeafCrumb.Provider>;
}

export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <AccountDataProvider>
      <LeafCrumbProvider>
        <ShellFrame>{children}</ShellFrame>
      </LeafCrumbProvider>
    </AccountDataProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const who = useWho();
  const signedIn = useAccountData().phase === "ready";
  const [menuOpen, setMenuOpen] = useState(false);

  // The phone drawer closes when a page is picked (the nav's onClick) and on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="pa-root">
      {menuOpen && <div className="pa-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <aside className="pa-side" id="pa-side" data-open={menuOpen}>
        <div className="pa-side-top">
          <Link href="/" className="pa-brand" aria-label="Platterly Account">
            {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a static SVG (Caterly's sidebar header, with Platterly's mark) */}
            <img src="/platterly-mark.svg" alt="" className="pa-brand-mark" width={36} height={36} />
            <span className="pa-brand-text">
              <span className="pa-brand-name">Platterly Account</span>
              <span className="pa-brand-sub">{who.name}</span>
            </span>
          </Link>
          <button type="button" className="pa-side-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <nav className="pa-nav" aria-label="Account" onClick={() => setMenuOpen(false)}>
          {NAV.filter((item) => !item.hidden).map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <div key={item.href} className="pa-nav-entry">
                {item.divider && <hr className="pa-nav-divider" />}
                <Link href={item.href} className="pa-nav-item" aria-current={active ? "page" : undefined}>
                  <Icon name={item.icon} size={18} />
                  <span>
                    {item.prefix && <span className="pa-nav-prefix">{item.prefix}</span>}
                    {item.label}
                  </span>
                </Link>
              </div>
            );
          })}
          <a href={HELP_URL} className="pa-nav-item" target="_blank" rel="noopener noreferrer">
            <Icon name="helpCircle" size={18} />
            <span>Help &amp; Support</span>
          </a>
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
        <AccountHeader onMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />
        <main className="pa-main">{children}</main>
      </div>
    </div>
  );
}
