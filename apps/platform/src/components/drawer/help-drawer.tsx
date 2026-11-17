"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/account/icons";
import { HelpDocuments } from "./help-docs";
import "./drawer.css";

/**
 * The Help button of the Account and the Store: it opens a panel from the right listing the help pages (FAQs, Security, the policies, Contact Us). The caller
 * gives the button its own look (`className`) and label (`children`); the panel is the same in both.
 */
export function HelpDrawer({ className, children }: { className: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <button ref={trigger} type="button" className={`${className} pd-help-trigger`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <div className="pd-scrim" onClick={close} aria-hidden="true" />}
      {open && (
        <aside className="pd-drawer" role="dialog" aria-modal="true" aria-label="Help" data-testid="help-drawer">
          <button ref={closeButton} type="button" className="pd-close" aria-label="Close" onClick={close}>
            <Icon name="x" size={18} />
          </button>
          <div className="pd-scroll">
            <div className="pd-help-head">
              <h2>Help</h2>
              <p>Answers, policies and how to reach us.</p>
            </div>
            <HelpDocuments onNavigate={close} />
          </div>
        </aside>
      )}
    </>
  );
}
