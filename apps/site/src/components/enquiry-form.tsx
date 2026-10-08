"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { BUSINESS_TYPES, EMPTY_ENQUIRY, SUBJECTS, submitEnquiry, validateEnquiry, type EnquiryErrors, type EnquiryKind, type EnquiryValues } from "@/lib/enquiry";

const INPUT = "mt-2 block min-h-12 w-full rounded-[12px] border border-ink-navy/25 bg-paper px-4 py-3 text-base text-ink-navy outline-none transition-colors duration-150 placeholder:text-slate-gray/70 hover:border-ink-navy/50 focus:border-ink-navy focus:ring-2 focus:ring-ink-navy/20 aria-[invalid=true]:border-[#b3261e]";

function Field({ id, label, optional, error, children }: { id: string; label: string; optional?: boolean; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label} {optional && <span className="font-normal text-slate-gray">(optional)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-[#b3261e]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The Talk to us and Contact us forms. It checks every field, quietly ignores robots (a hidden field only people never
 * see; no timing tricks that could swallow a real person's message), and sends to the form endpoint when there is one,
 * otherwise opens a ready-written email so nothing is lost.
 */
export function EnquiryForm({ kind, contact }: { kind: EnquiryKind; contact: { email: string; reply: string } }) {
  const [values, setValues] = useState<EnquiryValues>(EMPTY_ENQUIRY);
  const [errors, setErrors] = useState<EnquiryErrors>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "email" | "failed">("idle");
  const trap = useRef<HTMLInputElement>(null);
  const set = (key: keyof EnquiryValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const aria = (key: keyof EnquiryValues) => ({ "aria-invalid": errors[key] ? true : undefined, "aria-describedby": errors[key] ? `${kind}-${key}-error` : undefined });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    const found = validateEnquiry(kind, values);
    setErrors(found);
    if (Object.keys(found).length) return;
    // a robot filled the hidden field: pretend it worked and send nothing
    if (trap.current?.value) {
      setState("sent");
      return;
    }
    setState("sending");
    try {
      setState(await submitEnquiry(kind, values, contact.email));
    } catch {
      setState("failed");
    }
  }

  if (state === "sent" || state === "email")
    return (
      <div role="status" className="rounded-[24px] bg-badge-fill p-8">
        <h2 className="h-sub">{state === "sent" ? "Thank you, we have it." : "One last step: send the email."}</h2>
        <p className="mt-3 text-lg leading-relaxed text-slate-gray">
          {state === "sent" ? contact.reply : `We opened an email to ${contact.email} with your details filled in. Press send in your email app to reach us.`}
        </p>
      </div>
    );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-label={kind === "talk" ? "Talk to us" : "Contact us"}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${kind}-name`} label="Your name" error={errors.name}>
          <input id={`${kind}-name`} name="name" autoComplete="name" value={values.name} onChange={set("name")} className={INPUT} {...aria("name")} />
        </Field>
        <Field id={`${kind}-email`} label="Email" error={errors.email}>
          <input id={`${kind}-email`} name="email" type="email" autoComplete="email" value={values.email} onChange={set("email")} className={INPUT} {...aria("email")} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${kind}-phone`} label="Phone number" optional={kind === "contact"} error={errors.phone}>
          <input id={`${kind}-phone`} name="phone" type="tel" autoComplete="tel" value={values.phone} onChange={set("phone")} className={INPUT} {...aria("phone")} />
        </Field>
        {kind === "talk" ? (
          <Field id="talk-businessType" label="What do you run?" error={errors.businessType}>
            <select id="talk-businessType" name="businessType" value={values.businessType} onChange={set("businessType")} className={INPUT} {...aria("businessType")}>
              <option value="">Choose one</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field id="contact-subject" label="What is this about?" error={errors.subject}>
            <select id="contact-subject" name="subject" value={values.subject} onChange={set("subject")} className={INPUT} {...aria("subject")}>
              <option value="">Choose one</option>
              {SUBJECTS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field id={`${kind}-message`} label={kind === "talk" ? "Anything we should know?" : "Your message"} optional={kind === "talk"} error={errors.message}>
        <textarea id={`${kind}-message`} name="message" rows={5} value={values.message} onChange={set("message")} className={INPUT} {...aria("message")} />
      </Field>
      {/* Robots fill every field; people never see this one. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this empty
          <input ref={trap} name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state === "failed" && (
        <p role="alert" className="text-sm text-[#b3261e]">
          That did not go through. Please try again, or email us at <a className="underline" href={`mailto:${contact.email}`}>{contact.email}</a>.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={state === "sending"} className="inline-flex min-h-12 items-center justify-center rounded-button bg-ink-navy px-6 py-2.5 text-base font-medium text-cloud transition-colors duration-150 hover:bg-[#1b2f48] disabled:opacity-60">
          {state === "sending" ? "Sending…" : kind === "talk" ? "Request a call" : "Send message"}
        </button>
        <p className="text-sm text-slate-gray">{contact.reply}</p>
      </div>
    </form>
  );
}
