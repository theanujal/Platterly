"use client";

import { useEffect, useState, type FormEvent } from "react";
import { initials } from "@/lib/account/catalogue";
import { PhoneField } from "../phone-field";
import { Icon } from "./icons";
import { Avatar, Badge } from "./ui";

type Profile = { name: string; firstName: string; lastName: string; email: string; emailVerified: boolean; phone: string; timeZone: string; notifyProductUpdates: boolean };
type Errors = Partial<Record<"firstName" | "lastName" | "phone" | "timeZone" | "notifyProductUpdates", string>>;
type State = { phase: "loading" } | { phase: "error" } | { phase: "ready"; profile: Profile; timeZones: string[] };

async function patch(payload: Record<string, unknown>): Promise<{ ok: true; profile: Profile } | { ok: false; errors?: Errors }> {
  try {
    const res = await fetch("/api/account/profile", { method: "PATCH", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) });
    if (res.status === 401) {
      window.location.replace("/auth/start?next=%2Fprofile");
      return { ok: false };
    }
    const body = (await res.json().catch(() => null)) as { profile?: Profile; errors?: Errors } | null;
    if (res.ok && body?.profile) return { ok: true, profile: body.profile };
    return { ok: false, errors: body?.errors };
  } catch {
    return { ok: false };
  }
}

/** The head card, "Personal information" and the product-updates choice, all from the person's own stored profile. */
export function ProfileDetails() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<{ kind: "saved" | "failed"; text: string } | null>(null);
  const [draft, setDraft] = useState({ firstName: "", lastName: "", phone: "", timeZone: "" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/profile", { cache: "no-store", credentials: "same-origin" });
        if (!alive) return;
        if (res.status === 401) return window.location.replace("/auth/start?next=%2Fprofile");
        const body = (await res.json()) as { profile?: Profile; timeZones?: string[] };
        if (alive) setState(res.ok && body.profile && body.timeZones ? { phase: "ready", profile: body.profile, timeZones: body.timeZones } : { phase: "error" });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state.phase === "loading")
    return (
      <p className="pa-muted" role="status" aria-busy="true">
        Loading your profile…
      </p>
    );
  if (state.phase === "error")
    return (
      <p className="pa-muted" role="alert">
        We could not load your profile. Nothing was changed. Please reload the page.
      </p>
    );

  const { profile, timeZones } = state;
  const startEdit = () => {
    setDraft({ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone, timeZone: profile.timeZone });
    setErrors({});
    setNotice(null);
    setEditing(true);
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const result = await patch({ firstName: draft.firstName, lastName: draft.lastName, phone: draft.phone, timeZone: draft.timeZone });
    setBusy(false);
    if (result.ok) {
      setState({ phase: "ready", profile: result.profile, timeZones });
      setErrors({});
      setEditing(false);
      setNotice({ kind: "saved", text: "Your details were saved." });
    } else if (result.errors) {
      setErrors(result.errors);
    } else {
      setNotice({ kind: "failed", text: "We could not save your details. Nothing was changed. Please try again." });
    }
  }
  async function setUpdates(on: boolean) {
    // Shown at once; put back if the save fails.
    setState({ phase: "ready", profile: { ...profile, notifyProductUpdates: on }, timeZones });
    const result = await patch({ notifyProductUpdates: on });
    if (result.ok) setState({ phase: "ready", profile: result.profile, timeZones });
    else {
      setState({ phase: "ready", profile, timeZones });
      setNotice({ kind: "failed", text: "We could not save that choice. Nothing was changed." });
    }
  }

  const shownName = profile.name || profile.email;
  return (
    <>
      <section className="pa-card pa-profile-head" aria-label="Account holder">
        <Avatar label={initials(shownName)} size="xl" round />
        <div className="pa-profile-head-text">
          <h2>{shownName}</h2>
          <p className="pa-line">
            <Icon name="mail" size={14} /> {profile.email} {profile.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
          </p>
        </div>
      </section>

      <form className="pa-card pa-form" aria-labelledby="pf-personal" onSubmit={save} noValidate>
        <div className="pa-section-head">
          <h2 id="pf-personal">Personal information</h2>
          {!editing && (
            <button type="button" className="pa-btn pa-btn-outline" onClick={startEdit}>
              <Icon name="pencil" size={15} /> Edit
            </button>
          )}
        </div>
        {notice && (
          <p className="pa-muted" role={notice.kind === "failed" ? "alert" : "status"}>
            {notice.text}
          </p>
        )}
        <div className="pa-form-grid">
          {(["firstName", "lastName"] as const).map((key) => (
            <div className="pa-field" key={key}>
              <label htmlFor={`pf-${key}`}>{key === "firstName" ? "First name" : "Last name"}</label>
              <input id={`pf-${key}`} value={editing ? draft[key] : profile[key]} placeholder="Not set" disabled={!editing} readOnly={!editing} maxLength={40} autoComplete={key === "firstName" ? "given-name" : "family-name"} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `pf-${key}-err` : undefined} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
              {errors[key] && (
                <span className="pa-hint" id={`pf-${key}-err`} role="alert">
                  {errors[key]}
                </span>
              )}
            </div>
          ))}
          <div className="pa-field">
            <label htmlFor="pf-email">Email</label>
            <input id="pf-email" value={profile.email} disabled readOnly />
            <span className="pa-hint">Changing your email needs a code sent to the new address. Use the Security page.</span>
          </div>
          <div className="pa-field">
            <label htmlFor="pf-phone">Phone</label>
            <PhoneField id="pf-phone" value={editing ? draft.phone : profile.phone} onChange={(v) => setDraft({ ...draft, phone: v })} disabled={!editing} describedBy={errors.phone ? "pf-phone-err" : undefined} invalid={!!errors.phone} />
            {errors.phone && (
              <span className="pa-hint" id="pf-phone-err" role="alert">
                {errors.phone}
              </span>
            )}
          </div>
          <div className="pa-field">
            <label htmlFor="pf-tz">Time zone</label>
            <select id="pf-tz" value={editing ? draft.timeZone : profile.timeZone} disabled={!editing} onChange={(e) => setDraft({ ...draft, timeZone: e.target.value })}>
              {timeZones.includes(profile.timeZone) ? null : <option value={profile.timeZone}>{profile.timeZone}</option>}
              {timeZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            {errors.timeZone && (
              <span className="pa-hint" role="alert">
                {errors.timeZone}
              </span>
            )}
          </div>
        </div>
        {editing && (
          <div className="pa-form-actions">
            <button type="submit" className="pa-btn pa-btn-primary" disabled={busy}>
              Save changes
            </button>
            <button type="button" className="pa-btn pa-btn-outline" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        )}
      </form>

      <section className="pa-card pa-form" aria-labelledby="pf-prefs">
        <div className="pa-section-head">
          <h2 id="pf-prefs">
            <Icon name="bell" size={16} /> Notifications
          </h2>
        </div>
        <div className="pa-switch-row">
          <div>
            <label htmlFor="pf-updates">Product updates</label>
            <span className="pa-hint">News about new features, by email. Off unless you turn it on.</span>
          </div>
          <input id="pf-updates" type="checkbox" role="switch" className="pa-switch" checked={profile.notifyProductUpdates} onChange={(e) => setUpdates(e.target.checked)} />
        </div>
        <div className="pa-switch-row">
          <div>
            <label htmlFor="pf-alerts">Security alerts</label>
            <span className="pa-hint">Always on. We email you about sign-ins and changes to your account.</span>
          </div>
          <input id="pf-alerts" type="checkbox" role="switch" className="pa-switch" checked disabled readOnly />
        </div>
      </section>
    </>
  );
}
