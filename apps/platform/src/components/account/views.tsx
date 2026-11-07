"use client";

import Link from "next/link";
import { initials } from "@/lib/account/catalogue";
import { selectedProduct } from "@/lib/account/state";
import { BusinessCard, CaterlyCard, RivoCard, TeamCard } from "./cards";
import { BusinessGate, DataGate } from "./data";
import { Icon } from "./icons";
import { AccountShell } from "./shell";
import { useAccount } from "./store";
import { useEffect, useState } from "react";
import { Avatar, Badge, PageHeader, PlaceholderNote } from "./ui";

export function OverviewView() {
  const account = useAccount();
  const product = selectedProduct(account);

  return (
    <AccountShell>
      <PageHeader title="Welcome back" lede="Your Platterly products, in one place." />
      <DataGate>
        {(overview) => (
          <>
            <section aria-labelledby="ov-profile" className="pa-narrow">
              <div className="pa-section-head">
                <h2 id="ov-profile">Your profile</h2>
                <Link href="/profile" className="pa-link">
                  View <Icon name="chevronRight" size={14} />
                </Link>
              </div>
              <div className="pa-card pa-profile-sum">
                <Avatar label={initials(overview.user.email)} size="lg" round />
                <div>
                  <h3>{overview.user.email}</h3>
                  <p className="pa-line">
                    <Icon name="mail" size={14} /> {overview.user.emailVerified ? "Email verified" : "Email not verified"}
                  </p>
                  <p className="pa-line">
                    <Icon name="phone" size={14} /> Name and phone are not stored yet
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="ov-products">
              <div className="pa-section-head">
                <h2 id="ov-products">My Products</h2>
                <Link href="/products" className="pa-link">
                  All products <Icon name="chevronRight" size={14} />
                </Link>
              </div>
              <BusinessGate overview={overview}>
                {(b) => (
                  <div className="pa-grid-2">
                    <CaterlyCard business={b.business} link={b.products.caterly} selected={product.id === "caterly"} />
                    <RivoCard selected={product.id === "rivo"} />
                  </div>
                )}
              </BusinessGate>
            </section>
          </>
        )}
      </DataGate>
    </AccountShell>
  );
}

export function BusinessView() {
  return (
    <AccountShell>
      <PageHeader title="My Business" lede="The business behind your Platterly account. Each sign-in has one business." />
      <DataGate>
        {(overview) => (
          <BusinessGate overview={overview}>
            {(b) => (
              <>
                <div className="pa-business-wrap">
                  <BusinessCard business={b.business} products={b.products} />
                </div>
                <p className="pa-foot-note">One sign-in holds one business. A second kitchen needs another email address. Business type and city are not stored yet. Editing business details and handing the Admin role to someone else will be added here.</p>
              </>
            )}
          </BusinessGate>
        )}
      </DataGate>
    </AccountShell>
  );
}

export function ProductsView() {
  const account = useAccount();
  const product = selectedProduct(account);
  return (
    <AccountShell>
      <PageHeader title="My Products" lede={`Products available to your business. Use the switcher in the sidebar to choose the product you are working in. Now: ${product.name}.`} />
      <DataGate>
        {(overview) => (
          <BusinessGate overview={overview}>
            {(b) => (
              <>
                <div className="pa-grid-2">
                  <CaterlyCard business={b.business} link={b.products.caterly} selected={product.id === "caterly"} />
                  <RivoCard selected={product.id === "rivo"} />
                </div>
                {b.products.caterly !== "none" ? <TeamCard product="Caterly" team={b.team} /> : null}
              </>
            )}
          </BusinessGate>
        )}
      </DataGate>
    </AccountShell>
  );
}

function Field({ id, label, value, hint, placeholder }: { id: string; label: string; value: string; hint?: string; placeholder?: string }) {
  return (
    <div className="pa-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} placeholder={placeholder} disabled readOnly />
      {hint && <span className="pa-hint">{hint}</span>}
    </div>
  );
}

function Switch({ id, label, hint, checked, disabled }: { id: string; label: string; hint: string; checked: boolean; disabled?: boolean }) {
  return (
    <div className="pa-switch-row">
      <div>
        <label htmlFor={id}>{label}</label>
        <span className="pa-hint">{hint}</span>
      </div>
      <input id={id} type="checkbox" role="switch" className="pa-switch" checked={checked} disabled={disabled} readOnly />
    </div>
  );
}

export function ProfileView() {
  return (
    <AccountShell>
      <PageHeader title="My Profile" lede="Your personal details and account settings. They apply to every business and product." />
      <DataGate>
        {(overview) => (
          <>
            <section className="pa-card pa-profile-head" aria-label="Account holder">
              <Avatar label={initials(overview.user.email)} size="xl" round />
              <div className="pa-profile-head-text">
                <h2>{overview.user.email}</h2>
                <p className="pa-line">
                  <Icon name="mail" size={14} /> {overview.user.email} {overview.user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
                </p>
              </div>
            </section>

            <section className="pa-card pa-form" aria-labelledby="pf-personal">
              <div className="pa-section-head">
                <h2 id="pf-personal">Personal information</h2>
                <button type="button" className="pa-btn pa-btn-outline" disabled title="Editing needs write support, which is not built yet.">
                  <Icon name="pencil" size={15} /> Edit
                </button>
              </div>
              <div className="pa-form-grid">
                <Field id="pf-name" label="Full name" value="" placeholder="Not stored yet" />
                <Field id="pf-email" label="Email" value={overview.user.email} hint="Changing your email will need a code sent to the new address. Not available yet." />
                <Field id="pf-phone" label="Phone" value="" placeholder="Not stored yet" />
                <Field id="pf-tz" label="Time zone" value="" placeholder="Not stored yet" />
                <Field id="pf-lang" label="Language" value="" placeholder="Not stored yet" />
              </div>
            </section>

            <section className="pa-card pa-form" aria-labelledby="pf-prefs">
              <div className="pa-section-head">
                <h2 id="pf-prefs">
                  <Icon name="bell" size={16} /> Notifications
                </h2>
              </div>
              <Switch id="pf-updates" label="Product updates" hint="Notification choices are not stored yet." checked={false} disabled />
              <Switch id="pf-alerts" label="Security alerts" hint="Always on. We email you about sign-ins and changes to your account." checked disabled />
            </section>

            <section className="pa-card pa-form" aria-labelledby="pf-security">
              <div className="pa-section-head">
                <h2 id="pf-security">
                  <Icon name="shield" size={16} /> Security
                </h2>
              </div>
              <div className="pa-switch-row">
                <div>
                  <span className="pa-row-label">Password, two-step verification and signed-in devices</span>
                  <span className="pa-hint">These settings have their own page.</span>
                </div>
                <Link href="/security" className="pa-btn pa-btn-outline">
                  Open Security
                </Link>
              </div>
            </section>
          </>
        )}
      </DataGate>
    </AccountShell>
  );
}

const SECURITY_ROWS = [
  { label: "Password", hint: "Change the password you use to sign in.", action: "Change password" },
  { label: "Two-step verification", hint: "Add a second check when you sign in.", action: "Set up" },
  { label: "Recovery email", hint: "Where we send a code if you are locked out.", action: "Change recovery email" },
];

type Device = { id: string; label: string; lastActive: string; current: boolean };
type DevicesState = { phase: "loading" } | { phase: "error" } | { phase: "ready"; devices: Device[] };

/** Signed-in devices (F4.3.1): the person's own live sessions from the server, with sign out for one device and for all of them. */
function Devices() {
  const [state, setState] = useState<DevicesState>({ phase: "loading" });
  const [busy, setBusy] = useState(false);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/sessions", { cache: "no-store", credentials: "same-origin" });
        if (!alive) return;
        if (!res.ok) return setState({ phase: "error" });
        const body = (await res.json()) as { devices?: Device[] };
        if (alive) setState(Array.isArray(body.devices) ? { phase: "ready", devices: body.devices } : { phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [tick]);

  async function revoke(payload: { id: string } | { all: true }) {
    setBusy(true);
    try {
      const res = await fetch("/api/account/sessions/revoke", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) });
      if (!res.ok) return setState({ phase: "error" });
      const body = (await res.json()) as { signedOut?: boolean };
      // Ending the session this page is using signs the person out: go back to the start.
      if (body.signedOut) window.location.assign("/");
      else setTick((t) => t + 1);
    } catch {
      setState({ phase: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pa-card pa-form" aria-labelledby="sc-devices">
      <div className="pa-section-head">
        <h2 id="sc-devices">
          <Icon name="shield" size={16} /> Signed-in devices
        </h2>
        <button type="button" className="pa-btn pa-btn-outline" disabled={busy || state.phase !== "ready"} onClick={() => revoke({ all: true })}>
          <Icon name="logout" size={15} /> Sign out everywhere
        </button>
      </div>
      {state.phase === "loading" && (
        <p className="pa-muted" role="status" aria-busy="true">
          Loading your devices…
        </p>
      )}
      {state.phase === "error" && (
        <p className="pa-muted" role="alert">
          We could not load your devices. Nothing was changed. Please reload the page.
        </p>
      )}
      {state.phase === "ready" && (
        <ul className="pa-sessions" aria-label="Signed-in devices">
          {state.devices.map((d) => (
            <li className="pa-session" key={d.id}>
              <span className="pa-session-text">
                <span className="pa-row-label">{d.label}</span>
                <span className="pa-hint">Last active {new Date(d.lastActive).toLocaleString()}</span>
              </span>
              {d.current ? (
                <Badge tone="success">This device</Badge>
              ) : (
                <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => revoke({ id: d.id })}>
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SecurityView() {
  return (
    <AccountShell>
      <PageHeader title="Security" lede="How you sign in to Platterly and where you are signed in. These settings apply to every business and product." />
      <DataGate>
        {(overview) => (
          <>
            <PlaceholderNote>Your email and your signed-in devices are real. Changing your password here, two-step verification and a recovery email are not built yet.</PlaceholderNote>

            <section className="pa-card pa-form" aria-labelledby="sc-signin">
              <div className="pa-section-head">
                <h2 id="sc-signin">
                  <Icon name="lock" size={16} /> Sign-in
                </h2>
              </div>
              <div className="pa-switch-row">
                <div>
                  <span className="pa-row-label">Email</span>
                  <span className="pa-hint">{overview.user.email}</span>
                </div>
                {overview.user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
              </div>
              {SECURITY_ROWS.map((row) => (
                <div className="pa-switch-row" key={row.label}>
                  <div>
                    <span className="pa-row-label">{row.label}</span>
                    <span className="pa-hint">{row.hint}</span>
                  </div>
                  <div className="pa-row-actions">
                    <Badge tone="neutral">Not available yet</Badge>
                    <button type="button" className="pa-btn pa-btn-outline" disabled title="Not built yet.">
                      {row.action}
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <Devices />
          </>
        )}
      </DataGate>
    </AccountShell>
  );
}

