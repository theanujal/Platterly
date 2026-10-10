import Link from "next/link";
import { QrCode, ExternalLink, Settings2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { canonicalUrl, withSrc } from "@/lib/seo/canonical";
import { generateQrCodeDataUrl } from "@/lib/secure-access/qr";
import { CopyButton } from "@/components/ui/copy-button";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
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
// 2026-10-10: stacked (QR on top, link and actions below) so it fits a quarter-width dashboard column.
export async function PublicMenuShortcutCard({ slug, slugChangeCount }: PublicMenuShortcutCardProps) {
  const claimed = slugChangeCount > 0;
  const url = claimed ? canonicalUrl(`/${slug}`) : null;
  const qrDataUrl = url ? await generateQrCodeDataUrl(withSrc(url, "qr")) : null;

  return (
    <Card className="h-full">
      <DashboardCardHeader icon={QrCode} title="Public Menu / QR" colorClassName="bg-primary/10 text-primary" />
      <CardContent className="flex flex-col items-center gap-3 text-center">
        {claimed && url ? (
          <>
            <p className="text-xs font-medium text-muted-foreground">Scan the QR code or share the link</p>
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR code for your public menu link" className="size-36 shrink-0 rounded-lg border border-border p-1.5" data-testid="public-menu-qr" />
            )}
            <p className="w-full min-w-0 truncate text-sm text-muted-foreground">{url}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="icon-sm" aria-label="View public menu" title="View public menu" render={<a href={url} target="_blank" rel="noopener" />} nativeButton={false}>
                <ExternalLink className="size-4" />
              </Button>
              <CopyButton value={url} label="Copy link" iconOnly />
              {qrDataUrl && (
                <Button variant="outline" size="icon-sm" aria-label="Download QR code" title="Download QR code" render={<a href={qrDataUrl} download="public-menu-qr.png" />} nativeButton={false}>
                  <Download className="size-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Share on WhatsApp"
                title="Share on WhatsApp"
                render={<a href={`https://wa.me/?text=${encodeURIComponent(`Check out our menu and book with us: ${withSrc(url, "whatsapp")}`)}`} target="_blank" rel="noopener" />}
                nativeButton={false}
              >
                <WhatsAppIcon className="size-4 text-emerald-600" />
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Manage public link" title="Manage public link" render={<Link href="/settings/integration/public-menu-link" />} nativeButton={false}>
                <Settings2 className="size-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">You haven&apos;t set your public menu link yet.</p>
            <Button variant="outline" size="md" render={<Link href="/settings/integration/public-menu-link" />} nativeButton={false}>
              Set your public link
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
