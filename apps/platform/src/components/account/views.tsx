"use client";

import Link from "next/link";
import { useState } from "react";
import { BUSINESSES, initials, LANGUAGES, MOCK_USER, STATUS_LABEL, TIMEZONES, type Profile } from "@/lib/account/mock-data";
import { selectedBusiness } from "@/lib/account/state";
import { BusinessCard, CaterlyCard, RivoCard, STATUS_TONE } from "./cards";
import { Icon } from "./icons";
import { AccountShell } from "./shell";
import { dispatch, useAccount } from "./store";
import { Avatar, Badge, PageHeader } from "./ui";

export function OverviewView() {
  const account = useAccount();
  const current = selectedBusiness(account);
  const link = account.caterly[current.id];
  const { profile } = account;

  return (
    <AccountShell>
      <PageHeader title={`Welcome back, ${MOCK_USER.firstName}`} lede="One Platterly account for all your businesses and products." />

      <section className="pa-workspace" aria-label="Current business">
        <Avatar label={initials(current.name)} size="xl" />
        <div className="pa-workspace-id">
          <span className="pa-eyebrow">You are working in</span>
          <h2>{current.name}</h2>
          <p>
            {current.type} · {current.city}
          </p>
        </div>
        <dl className="pa-workspace-facts">
          <div>
            <dt>Status</dt>
            <dd>
              <Badge tone={STATUS_TONE[current.status]}>{STATUS_LABEL[current.status]}</Badge>
            </dd>
          </div>
          <div>
            <dt>Your role</dt>
            <dd>{current.role}</dd>
          </div>
          <div>
            <dt>Team</dt>
            <dd>{current.members} members</dd>
          </div>
          <div>
            <dt>Caterly</dt>
            <dd>{link.status === "none" ? "Not set up" : link.status === "trial" ? "On trial" : "Active"}</dd>
          </div>
        </dl>
      </section>

      <div className="pa-two-col">
        <section aria-labelledby="ov-biz">
          <div className="pa-section-head">
            <h2 id="ov-biz">My Businesses</h2>
            <Link href="/businesses" className="pa-link">
              Manage <Icon name="chevronRight" size={14} />
            </Link>
          </div>
          <ul className="pa-mini-list">
            {BUSINESSES.map((b) => (
              <li key={b.id}>
                <button type="button" className={`pa-mini${b.id === current.id ? " is-selected" : ""}`} aria-label={b.id === current.id ? `${b.name}, selected` : `Switch to ${b.name}`} onClick={() => dispatch({ type: "selectBusiness", id: b.id })}>
                  <Avatar label={initials(b.name)} size="md" />
                  <span className="pa-mini-text">
                    <span className="pa-mini-name">{b.name}</span>
                    <span className="pa-mini-sub">
                      {b.type} · {b.city}
                    </span>
                  </span>
                  <Badge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                  {b.id === current.id && <Icon name="check" size={16} className="pa-mini-tick" />}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="ov-profile">
          <div className="pa-section-head">
            <h2 id="ov-profile">Your profile</h2>
            <Link href="/profile" className="pa-link">
              Edit <Icon name="chevronRight" size={14} />
            </Link>
          </div>
          <div className="pa-card pa-profile-sum">
            <Avatar label={initials(profile.fullName)} size="lg" round />
            <div>
              <h3>{profile.fullName}</h3>
              <p className="pa-line">
                <Icon name="mail" size={14} /> {profile.email}
              </p>
              <p className="pa-line">
                <Icon name="phone" size={14} /> {profile.phone}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby="ov-products">
        <div className="pa-section-head">
          <h2 id="ov-products">My Products</h2>
          <Link href="/products" className="pa-link">
            All products <Icon name="chevronRight" size={14} />
          </Link>
        </div>
        <div className="pa-grid-2">
          <CaterlyCard business={current} link={link} />
          <RivoCard />
        </div>
      </section>
    </AccountShell>
  );
}

export function BusinessesView() {
  const account = useAccount();
  return (
    <AccountShell>
      <PageHeader title="My Businesses" lede="Every business you belong to, under one sign-in. Switch between them at any time." />
      <ul className="pa-grid-3" aria-label="Businesses">
        {BUSINESSES.map((b) => (
          <li key={b.id}>
            <BusinessCard business={b} link={account.caterly[b.id]} selected={b.id === account.selectedBusinessId} />
          </li>
        ))}
      </ul>
      <p className="pa-foot-note">Creating a new business, inviting people and changing roles will be added here. They are not part of this prototype.</p>
    </AccountShell>
  );
}

export function ProductsView() {
  const account = useAccount();
  const current = selectedBusiness(account);
  return (
    <AccountShell>
      <PageHeader title="My Products" lede={`Products available to ${current.name}. Switch business in the sidebar to see another one.`} />
      <div className="pa-grid-2">
        <CaterlyCard business={current} link={account.caterly[current.id]} />
        <RivoCard />
      </div>
    </AccountShell>
  );
}

function Field({ id, label, value, editing, onChange, hint, readOnly, options }: { id: string; label: string; value: string; editing: boolean; onChange?: (v: string) => void; hint?: string; readOnly?: boolean; options?: string[] }) {
  const locked = !editing || readOnly;
  return (
    <div className="pa-field">
      <label htmlFor={id}>{label}</label>
      {options ? (
        <select id={id} value={value} disabled={locked} onChange={(e) => onChange?.(e.target.value)}>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input id={id} value={value} disabled={locked} onChange={(e) => onChange?.(e.target.value)} />
      )}
      {hint && <span className="pa-hint">{hint}</span>}
    </div>
  );
}

function Switch({ id, label, hint, checked, disabled, onChange }: { id: string; label: string; hint: string; checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <div className="pa-switch-row">
      <div>
        <label htmlFor={id}>{label}</label>
        <span className="pa-hint">{hint}</span>
      </div>
      <input id={id} type="checkbox" role="switch" className="pa-switch" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
    </div>
  );
}

export function ProfileView() {
  const account = useAccount();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Profile>(account.profile);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const shown = editing ? draft : account.profile;
  const set = (key: keyof Profile) => (v: string) => setDraft((d) => ({ ...d, [key]: v }));

  const startEdit = () => {
    setDraft(account.profile);
    setSaved(false);
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const save = () => {
    dispatch({ type: "saveProfile", profile: { ...draft, fullName: draft.fullName.trim() || account.profile.fullName } });
    setEditing(false);
    setSaved(true);
  };

  return (
    <AccountShell>
      <PageHeader title="Profile" lede="Your personal details and account settings. They apply to every business and product." />

      <section className="pa-card pa-profile-head" aria-label="Account holder">
        <Avatar label={initials(account.profile.fullName)} size="xl" round />
        <div className="pa-profile-head-text">
          <h2>{account.profile.fullName}</h2>
          <p className="pa-line">
            <Icon name="mail" size={14} /> {account.profile.email} <Badge tone="success">Verified</Badge>
          </p>
        </div>
      </section>

      <section className="pa-card pa-form" aria-labelledby="pf-personal">
        <div className="pa-section-head">
          <h2 id="pf-personal">Personal information</h2>
          {!editing && (
            <button type="button" className="pa-btn pa-btn-outline" onClick={startEdit}>
              <Icon name="pencil" size={15} /> Edit
            </button>
          )}
        </div>
        <div className="pa-form-grid">
          <Field id="pf-name" label="Full name" value={shown.fullName} editing={editing} onChange={set("fullName")} />
          <Field id="pf-email" label="Email" value={shown.email} editing={editing} readOnly hint="Changing your email will need a code sent to the new address. Not available in this prototype." />
          <Field id="pf-phone" label="Phone" value={shown.phone} editing={editing} onChange={set("phone")} />
          <Field id="pf-tz" label="Time zone" value={shown.timezone} editing={editing} onChange={set("timezone")} options={TIMEZONES} />
          <Field id="pf-lang" label="Language" value={shown.language} editing={editing} onChange={set("language")} options={LANGUAGES} />
        </div>
        {editing && (
          <div className="pa-form-foot">
            <button type="button" className="pa-btn pa-btn-outline" onClick={cancel}>
              Cancel
            </button>
            <button type="button" className="pa-btn pa-btn-primary" onClick={save}>
              Save changes
            </button>
          </div>
        )}
        {saved && !editing && (
          <p className="pa-saved" role="status">
            <Icon name="check" size={14} /> Saved in this browser tab only.
          </p>
        )}
      </section>

      <section className="pa-card pa-form" aria-labelledby="pf-prefs">
        <div className="pa-section-head">
          <h2 id="pf-prefs">
            <Icon name="bell" size={16} /> Notifications
          </h2>
        </div>
        <Switch id="pf-updates" label="Product updates" hint="News about new Platterly products and features." checked={account.productUpdates} onChange={(value) => dispatch({ type: "setProductUpdates", value })} />
        <Switch id="pf-alerts" label="Security alerts" hint="Always on. We email you about sign-ins and changes to your account." checked disabled />
      </section>

      <section className="pa-card pa-form" aria-labelledby="pf-security">
        <div className="pa-section-head">
          <h2 id="pf-security">
            <Icon name="shield" size={16} /> Security
          </h2>
        </div>
        {[
          { label: "Password", hint: "Change the password you use to sign in.", action: "Change password" },
          { label: "Two-step verification", hint: "Add a second check when you sign in.", action: "Set up" },
          { label: "Signed-in devices", hint: "See and sign out the devices using your account.", action: "Review" },
        ].map((row) => (
          <div className="pa-switch-row" key={row.label}>
            <div>
              <span className="pa-row-label">{row.label}</span>
              <span className="pa-hint">{row.hint}</span>
            </div>
            <button type="button" className="pa-btn pa-btn-outline" onClick={() => setNotice(`${row.label} is not connected in this prototype.`)}>
              {row.action}
            </button>
          </div>
        ))}
        {notice && (
          <p className="pa-saved pa-saved-muted" role="status">
            {notice}
          </p>
        )}
      </section>
    </AccountShell>
  );
}
