"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SLUG_PATTERN } from "@/modules/tenants/slug-rules";
import { SlugField } from "@/components/slug-field";
import { setCustomSlugAction } from "../actions";

interface PublicMenuLinkFormProps {
  currentSlug: string;
  slugChangeCount: number;
  /** A slugified suggestion from the business name — only used to seed the field pre-claim, never the ugly auto-generated placeholder. */
  suggestedSlug?: string;
  /** The kitchen has paid for printed QR stands: they point at the current link, so changing it breaks them. Warn first (AJ, 2026-10-12). */
  printedStands?: boolean;
}

const CHANGE_LIMIT = 2;

export function PublicMenuLinkForm({ currentSlug, slugChangeCount, suggestedSlug, printedStands = false }: PublicMenuLinkFormProps) {
  const router = useRouter();
  const [slug, setSlug] = useState(slugChangeCount === 0 ? (suggestedSlug ?? "") : currentSlug);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const [understood, setUnderstood] = useState(false);
  // Only a real change matters: the same link saved again breaks nothing.
  const changing = printedStands && slug !== currentSlug;

  const remainingChanges = Math.max(0, CHANGE_LIMIT - slugChangeCount);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);
    const result = await setCustomSlugAction(slug);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <SlugField id="public-menu-slug" value={slug} onChange={setSlug} />
      <p className="text-xs text-muted-foreground">
        {remainingChanges > 0
          ? `${remainingChanges} free change${remainingChanges === 1 ? "" : "s"} remaining.`
          : "You've used all your free changes — contact support for further changes."}
      </p>
      {changing && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning" data-testid="stand-link-warning">
          <p className="font-semibold">Your printed QR stands will stop working</p>
          <p>The QR on your Order QR stands is your current link, and there is no redirect. If you change it, customers who scan those stands will not reach you.</p>
          <div className="flex items-center gap-2">
            <Checkbox id="understand-stands" checked={understood} onCheckedChange={(checked) => setUnderstood(checked === true)} />
            <Label htmlFor="understand-stands">I understand</Label>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {success && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button type="submit" disabled={pending || slug.length === 0 || !SLUG_PATTERN.test(slug) || (changing && !understood)} className="self-start">
        {pending ? "Saving…" : "Save link"}
      </Button>
    </form>
  );
}
