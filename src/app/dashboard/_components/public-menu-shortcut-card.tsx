import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { canonicalUrl } from "@/lib/seo/canonical";

export function PublicMenuShortcutCard({ slug }: { slug: string }) {
  const url = canonicalUrl(`/${slug}`);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public Menu / QR</CardTitle>
      </CardHeader>
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
