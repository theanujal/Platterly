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
import { DataRights } from "./data-rights";
import { RecoveryEmail } from "./recovery-email";
import { TwoFactor } from "./two-factor";
import { ChangeEmail } from "./change-email";
import { ChangePassword } from "./change-password";
import { SignInHistory } from "./sign-in-history";
import { ProfileDetails } from "./profile-details";
import { Avatar, Badge, PageHeader } from "./ui";

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
                <Avatar label={initials(overview.user.name ?? overview.user.email)} size="lg" round />
                <div>
                  <h3>{overview.user.name ?? overview.user.email}</h3>
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

export function ProfileView() {
  return (
    <AccountShell>
      <PageHeader title="My Profile" lede="Your personal details and account settings. They apply to every business and product." />
      <DataGate>
        {() => (
          <>
            <ProfileDetails />

            <DataRights />

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
              <ChangeEmail />
              <ChangePassword />
              <TwoFactor />
              <RecoveryEmail />
            </section>

            <Devices />
            <SignInHistory />
          </>
        )}
      </DataGate>
    </AccountShell>
  );
}

