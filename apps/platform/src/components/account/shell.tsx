"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BUSINESSES, initials, STATUS_LABEL } from "@/lib/account/mock-data";
import { selectedBusiness } from "@/lib/account/state";
import { Icon, type IconName } from "./icons";
import { dispatch, useAccount } from "./store";
import { Avatar } from "./ui";
import "./account.css";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Overview", icon: "home" },
  { href: "/businesses", label: "Businesses", icon: "building" },
  { href: "/products", label: "Products", icon: "grid" },
  { href: "/profile", label: "Profile", icon: "user" },
];

/** The workspace picker: one account, several businesses. Picking one only changes local state in this prototype. */
function BusinessSwitcher() {
  const account = useAccount();
  const current = selectedBusiness(account);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

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
      <button type="button" className="pa-switcher-btn" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={`Business: ${current.name}. Switch business`} onClick={() => setOpen((v) => !v)}>
        <Avatar label={initials(current.name)} size="sm" />
        <span className="pa-switcher-text">
          <span className="pa-switcher-cap">Working in</span>
          <span className="pa-switcher-name">{current.name}</span>
        </span>
        <Icon name="chevronDown" size={16} className="pa-switcher-chev" />
      </button>
      {open && (
        <ul className="pa-switcher-list" id={listId} role="listbox" aria-label="Your businesses">
          {BUSINESSES.map((b) => (
            <li key={b.id} role="option" aria-selected={b.id === current.id}>
              <button
                type="button"
                className="pa-switcher-opt"
                onClick={() => {
                  dispatch({ type: "selectBusiness", id: b.id });
                  setOpen(false);
                }}
              >
                <Avatar label={initials(b.name)} size="sm" />
                <span className="pa-switcher-text">
                  <span className="pa-switcher-name">{b.name}</span>
                  <span className="pa-switcher-cap">
                    {b.city} · {STATUS_LABEL[b.status]}
                  </span>
                </span>
                {b.id === current.id && <Icon name="check" size={16} className="pa-switcher-tick" />}
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
        <BusinessSwitcher />
        <nav className="pa-nav" aria-label="Account">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className="pa-nav-item" aria-current={active ? "page" : undefined}>
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
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
      <main className="pa-main">{children}</main>
    </div>
  );
}
