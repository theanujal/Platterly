"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui";

/** Uploads one or more pictures to the library, one request each, then refreshes the page. */
export function Uploader() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  async function send(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setProblems([]);
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.set("file", file);
      try {
        const response = await fetch("/api/site/media", { method: "POST", body });
        if (!response.ok) failed.push(`${file.name}: ${((await response.json()) as { error?: string }).error ?? "not uploaded"}`);
      } catch {
        failed.push(`${file.name}: not uploaded`);
      }
    }
    setProblems(failed);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" aria-label="Choose pictures" className="sr-only" onChange={(e) => send(e.target.files)} />
      <div><Button type="button" disabled={busy} onClick={() => input.current?.click()}><Upload className="size-4" aria-hidden />{busy ? "Uploading…" : "Upload pictures"}</Button></div>
      <p className="text-xs text-muted-foreground">PNG, JPG, GIF or WebP, up to 4 MB each.</p>
      {problems.map((p) => <p key={p} role="alert" className="text-sm text-destructive">{p}</p>)}
    </div>
  );
}
