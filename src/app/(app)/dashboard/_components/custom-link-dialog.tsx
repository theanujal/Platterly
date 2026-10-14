"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SLUG_PATTERN } from "@/modules/tenants/slug-rules";
import { SlugField } from "@/components/slug-field";
import { setCustomSlugAction } from "../actions";

interface CustomLinkDialogProps {
  /** A slugified suggestion from the business name, if one exists yet — never the ugly auto-generated placeholder. */
  suggestedSlug?: string;
  /** True when `slugChangeCount === 0` — the caterer hasn't claimed a custom link yet. */
  defaultOpen: boolean;
}

// Chunk 4/8 (pulled forward, minimal) — reappears on every fresh Dashboard
// visit until a custom link is set (server-computed `defaultOpen`, no
// client-side "seen it" persistence). Dismissible within a visit via the
// overlay/close button, matching "keep notifying him... unless it's done."
// AJ, 2026-09-14 — this dialog is only ever shown pre-claim, so there is no
// real "current slug" to prefill; only a suggestion, or a blank field.
// AJ, 2026-10-14 — two-panel layout from his reference: an orange panel with a phone showing the customer form on the
// left (large screens), the field with its counter and the "changed once" notice on the right.
export function CustomLinkDialog({ suggestedSlug, defaultOpen }: CustomLinkDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [slug, setSlug] = useState(suggestedSlug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSave() {
    setError(null);
    setPending(true);
    const result = await setCustomSlugAction(slug);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <div className="grid md:grid-cols-2">
          <PhonePanel />
          <div className="flex flex-col gap-5 p-6 sm:p-10">
            <DialogHeader className="gap-3 pr-8">
              <DialogTitle className="text-3xl font-bold leading-tight">Create Your Custom Link</DialogTitle>
              <DialogDescription className="text-base">Create a custom link for your menu page that customers can easily remember and access.</DialogDescription>
            </DialogHeader>
            <p className="flex items-center gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base text-warning">
              <TriangleAlert className="size-5 shrink-0" />
              Your custom link can only be changed once.
            </p>
            <SlugField id="custom-slug" value={slug} onChange={setSlug} />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button size="lg" className="h-12 bg-success text-base font-semibold text-white hover:bg-success/90" disabled={pending || slug.length === 0 || !SLUG_PATTERN.test(slug)} onClick={handleSave}>
              {pending ? "Saving…" : "Create Link"}
            </Button>
            <Link href="/settings/integration/public-menu-link" className="self-center text-xs text-muted-foreground hover:text-foreground hover:underline">
              Manage your link in Settings
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The orange side: the headline and a tilted phone showing the customer's Plan Your Event form. Decoration only. */
function PhonePanel() {
  const field = (label: string, placeholder: string) => (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold">{label} <span className="text-destructive">•</span></span>
      <span className="rounded-md border border-border px-2 py-1.5 text-[10px] text-muted-foreground">{placeholder}</span>
    </div>
  );
  return (
    <div aria-hidden="true" className="relative hidden min-h-[34rem] flex-col items-center overflow-hidden bg-primary px-8 pt-16 text-center text-primary-foreground md:flex">
      <p className="text-4xl font-bold leading-tight">
        Create Your
        <br />
        own Custom link
      </p>
      <div className="absolute top-60 left-1/2 w-64 -translate-x-1/2 -rotate-[18deg] rounded-[2rem] border-[6px] border-neutral-800 bg-white p-5 text-left text-foreground shadow-xl">
        <p className="text-center text-sm font-bold">Plan Your Event</p>
        <p className="mb-3 text-center text-[9px] text-muted-foreground">Tell us about your special occasion</p>
        <div className="flex flex-col gap-2.5">
          {field("Your Name", "Enter your full name")}
          {field("Email Address", "your.email@example.com")}
          {field("Phone Number", "Enter your phone number")}
          {field("Event Date", "dd/mm/yyyy")}
          {field("Number of Guests", "Minimum 50 guests")}
        </div>
      </div>
    </div>
  );
}
