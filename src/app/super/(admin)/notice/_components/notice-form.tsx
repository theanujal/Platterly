"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NOTICE_LIMITS, type PlatformNoticeInput } from "@/modules/subscriptions/notice-limits";
import { NoticeBox } from "@/components/app-shell/upgrade-card";
import { saveNoticeAction } from "../actions";

export function NoticeForm({ initial }: { initial: PlatformNoticeInput }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof PlatformNoticeInput>(key: K, value: PlatformNoticeInput[K]) => setValues((previous) => ({ ...previous, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await saveNoticeAction(values);
    setPending(false);
    setMessage(result.ok ? { ok: true, text: "Saved. Kitchens see it on their next page load." } : { ok: false, text: result.error });
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Box</CardTitle>
          <CardDescription>Shown to every kitchen when it is on.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="notice-enabled" className="font-medium">
              Show this box to every kitchen
            </Label>
            <Switch id="notice-enabled" checked={values.enabled} onCheckedChange={(checked) => set("enabled", checked)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notice-title">Title</Label>
            <Input id="notice-title" maxLength={NOTICE_LIMITS.title} value={values.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notice-message">Text</Label>
            <Textarea id="notice-message" rows={3} maxLength={NOTICE_LIMITS.message} value={values.message} onChange={(e) => set("message", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notice-button-label">Button label (optional)</Label>
              <Input id="notice-button-label" maxLength={NOTICE_LIMITS.buttonLabel} value={values.buttonLabel} onChange={(e) => set("buttonLabel", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notice-button-url">Button link</Label>
              <Input id="notice-button-url" maxLength={NOTICE_LIMITS.buttonUrl} placeholder="/subscribe or https://…" value={values.buttonUrl} onChange={(e) => set("buttonUrl", e.target.value)} />
              <p className="text-xs text-muted-foreground">A page in Platterly (starts with /) or a secure address (https://).</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-60">
            <NoticeBox notice={{ title: values.title || null, message: values.message || null, buttonLabel: values.buttonLabel || null, buttonUrl: values.buttonUrl || null }} />
          </div>
        </CardContent>
      </Card>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-destructive"}`}>
          {message.text}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save notice"}
      </Button>
    </form>
  );
}
