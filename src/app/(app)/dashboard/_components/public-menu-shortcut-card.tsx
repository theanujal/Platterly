import Link from "next/link";
import { QrCode, MessageCircle, Settings2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { canonicalUrl } from "@/lib/seo/canonical";
import { generateQrCodeDataUrl } from "@/lib/secure-access/qr";
import { CopyButton } from "@/components/ui/copy-button";
import { DashboardCardHeader } from "./dashboard-card-header";

interface PublicMenuShortcutCardProps {
  slug: string;
  /** 0 = the caterer hasn't claimed a real public link yet (still the auto-generated placeholder). */
  slugChangeCount: number;
}

// AJ, 2026-09-14 — the placeholder slug generated at signup must never be
// presented as if it's already a live, shareable link. Show nothing but a
// claim prompt until `slugChangeCount` proves the caterer has actually set
// one (Chunk 8's `getPublishedTenantBySlug` uses the same signal to decide
// whether `/{slug}` actually resolves); only then render the real link and
// a real QR code.
export async function PublicMenuShortcutCard({ slug, slugChangeCount }: PublicMenuShortcutCardProps) {
  const claimed = slugChangeCount > 0;
  const url = claimed ? canonicalUrl(`/${slug}`) : null;
  const qrDataUrl = url ? await generateQrCodeDataUrl(url) : null;

  return (
    <Card>
      <DashboardCardHeader icon={QrCode} title="Public Menu / QR" colorClassName="bg-rose-500/10 text-rose-600" />
      <CardContent className="flex flex-col gap-3">
        {claimed && url ? (
          <>
            <p className="text-xs font-medium text-muted-foreground">Scan QR code or use the link</p>
            <div className="flex items-center gap-3">
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="QR code for your public menu link"
                  className="size-28 shrink-0 rounded-lg border border-border p-1"
                />
              )}
              <p className="min-w-0 truncate text-sm text-muted-foreground">{url}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" render={<a href={url} target="_blank" rel="noopener" />} nativeButton={false}>
                View
              </Button>
              <CopyButton value={url} />
              <Button
                variant="outline"
                size="sm"
                render={
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Check out our menu and book with us: ${url}`)}`}
                    target="_blank"
                    rel="noopener"
                  />
                }
                nativeButton={false}
              >
                <MessageCircle className="size-4 text-emerald-600" />
                Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/settings/integration/public-menu-link" />}
                nativeButton={false}
              >
                <Settings2 className="size-4" />
                Manage
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">You haven&apos;t set your public menu link yet.</p>
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/settings/integration/public-menu-link" />}
              nativeButton={false}
              className="self-start"
            >
              Set your public link
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
