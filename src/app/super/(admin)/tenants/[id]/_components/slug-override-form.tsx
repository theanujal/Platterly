"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { overrideSlugAction } from "../../actions";

interface SlugOverrideFormProps {
  tenantId: string;
  currentSlug: string;
  slugChangeCount: number;
}

export function SlugOverrideForm({ tenantId, currentSlug, slugChangeCount }: SlugOverrideFormProps) {
  const router = useRouter();
  const [slug, setSlug] = useState(currentSlug);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await overrideSlugAction(tenantId, slug);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <p className="text-xs text-neutral-500">
        Self-service changes used: {slugChangeCount}. A Super Admin override bypasses Chunk 8&apos;s 2-change limit.
      </p>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slug-override">Storefront slug</Label>
          <Input id="slug-override" maxLength={20} value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Override slug"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
