"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setCustomSlugAction } from "../actions";

interface PublicMenuLinkFormProps {
  currentSlug: string;
  slugChangeCount: number;
}

const CHANGE_LIMIT = 2;

export function PublicMenuLinkForm({ currentSlug, slugChangeCount }: PublicMenuLinkFormProps) {
  const router = useRouter();
  const [slug, setSlug] = useState(currentSlug);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="public-menu-slug">platterly.com/</Label>
        <Input
          id="public-menu-slug"
          maxLength={20}
          value={slug}
          onChange={(e) => setSlug(e.target.value.trim())}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {remainingChanges > 0
          ? `${remainingChanges} free change${remainingChanges === 1 ? "" : "s"} remaining.`
          : "You've used all your free changes — contact support for further changes."}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {success && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button type="submit" disabled={pending || slug.length === 0} className="self-start">
        {pending ? "Saving…" : "Save link"}
      </Button>
    </form>
  );
}
