"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setCustomSlugAction } from "../actions";

interface CustomLinkDialogProps {
  currentSlug: string;
  /** True when `slugChangeCount === 0` — the caterer hasn't claimed a custom link yet. */
  defaultOpen: boolean;
}

// Chunk 4/8 (pulled forward, minimal) — reappears on every fresh Dashboard
// visit until a custom link is set (server-computed `defaultOpen`, no
// client-side "seen it" persistence). Dismissible within a visit via the
// overlay/close button, matching "keep notifying him... unless it's done."
export function CustomLinkDialog({ currentSlug, defaultOpen }: CustomLinkDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [slug, setSlug] = useState(currentSlug);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Claim your custom link</DialogTitle>
          <DialogDescription>
            Your menu&apos;s public link. You need this before you can go live and share your menu with customers.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-slug">platterly.com/</Label>
          <Input
            id="custom-slug"
            maxLength={20}
            value={slug}
            onChange={(event) => setSlug(event.target.value.trim())}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="sm:justify-between">
          <Link
            href="/settings/integration/public-menu-link"
            className="self-center text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Manage your link in Settings
          </Link>
          <Button disabled={pending || slug.length === 0} onClick={handleSave}>
            {pending ? "Saving…" : "Save my link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
