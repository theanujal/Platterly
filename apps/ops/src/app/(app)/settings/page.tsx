import Link from "next/link";
import { Boxes, Mail } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { emailProviderConfigured } from "@/modules/messages/zeptomail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default function SettingsPage() {
  const staffEmails = (process.env.STAFF_NOTIFY_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  return (
    <>
      <PageHeader title="Settings" description="Set-up that rarely changes." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/settings/products">
          <Card className="h-full">
            <div className="mb-3 flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><Boxes className="size-5" aria-hidden /></div>
            <h2 className="text-base font-semibold">Products</h2>
            <p className="mt-1 text-sm text-muted-foreground">Add a product, see how it is connected, and set its invoice prefix.</p>
          </Card>
        </Link>
        <Card className="h-full">
          <div className="mb-3 flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><Mail className="size-5" aria-hidden /></div>
          <h2 className="flex items-center gap-2 text-base font-semibold">Staff emails <Badge tone={staffEmails.length && emailProviderConfigured() ? "success" : "neutral"}>{staffEmails.length && emailProviderConfigured() ? "On" : "Off"}</Badge></h2>
          <p className="mt-1 text-sm text-muted-foreground">Warnings and critical notifications are also emailed to the addresses in <span className="font-mono text-xs">STAFF_NOTIFY_EMAILS</span> (comma separated). {staffEmails.length ? `Now: ${staffEmails.join(", ")}.` : "Not set."}{emailProviderConfigured() ? "" : " ZeptoMail is not configured, so nothing is sent."}</p>
        </Card>
      </div>
    </>
  );
}
