import { getSiteNotice } from "@/modules/site-content/site-content";
import { NoticeForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notice bar" };

export default async function NoticePage() {
  const notice = await getSiteNotice();
  return (
    <>
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">The thin bar above the site&apos;s header.</p>
      <NoticeForm values={notice} />
    </>
  );
}
