import Link from "next/link";
import { QrCode } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { canonicalUrl } from "@/lib/seo/canonical";
import { DashboardCardHeader } from "./dashboard-card-header";

export function PublicMenuShortcutCard({ slug }: { slug: string }) {
  const url = canonicalUrl(`/${slug}`);

  return (
    <Card>
      <DashboardCardHeader icon={QrCode} title="Public Menu / QR" colorClassName="bg-rose-500/10 text-rose-600" />
      <CardContent className="flex flex-col gap-3">
        <p className="truncate text-sm text-muted-foreground">{url}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<a href={url} target="_blank" rel="noopener" />} nativeButton={false}>
            View
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/settings/integration/public-menu-link" />}
            nativeButton={false}
          >
            Manage
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
