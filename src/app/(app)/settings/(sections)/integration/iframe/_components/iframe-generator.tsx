"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/ui/copy-button";

const PRESETS = [
  { label: "Responsive", width: "100%", height: "600" },
  { label: "Desktop", width: "800", height: "600" },
  { label: "Mobile", width: "400", height: "800" },
] as const;

// Accepts "100%" or a plain pixel number; anything else falls back so the
// generated snippet is always valid HTML.
function cleanWidth(value: string): string {
  const v = value.trim();
  return /^\d{2,4}%?$/.test(v) ? v : "100%";
}

function cleanHeight(value: string): string {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 200 && n <= 4000 ? String(n) : "600";
}

export function IframeGenerator({ url }: { url: string }) {
  const [width, setWidth] = useState<string>(PRESETS[0].width);
  const [height, setHeight] = useState<string>(PRESETS[0].height);

  const w = cleanWidth(width);
  const h = cleanHeight(height);
  const widthAttr = w.endsWith("%") ? w : `${w}`;
  const code = `<iframe src="${url}" width="${widthAttr}" height="${h}" style="border: 0;" title="Order catering online" loading="lazy"></iframe>`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Quick Presets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="md"
                variant={width === preset.width && height === preset.height ? "default" : "outline"}
                onClick={() => {
                  setWidth(preset.width);
                  setHeight(preset.height);
                }}
              >
                {preset.label} ({preset.width}
                {preset.width.endsWith("%") ? "" : "px"} × {preset.height}px)
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="if-width">Width (px or %)</Label>
              <Input id="if-width" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="100%" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="if-height">Height (px)</Label>
              <Input id="if-height" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Iframe Code</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs" data-testid="iframe-code">
            {code}
          </pre>
          <div>
            <CopyButton value={code} label="Copy code" size="md" />
          </div>
          <p className="text-xs text-muted-foreground">Paste this into your website&apos;s HTML where you want your menu to appear.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Preview</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <iframe
            src={url}
            title="Iframe preview"
            style={{ border: 0, width: widthAttr.endsWith("%") ? widthAttr : `${widthAttr}px`, height: `${h}px`, maxWidth: "100%" }}
            className="rounded-lg border border-border"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Iframe Features</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Always shows your current menus, categories and items — no need to update the embed.</li>
            <li>Customers can place orders directly through the iframe.</li>
            <li>Responsive, and matches your storefront&apos;s branding.</li>
            <li>Served over HTTPS.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
