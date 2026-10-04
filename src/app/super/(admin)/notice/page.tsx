import { requireSuperAdminOrRedirect } from "../../_lib/guard";
import { getPlatformNotice } from "@/modules/subscriptions/platform-notice";
import { PageHeader } from "../_components/page-header";
import { NoticeForm } from "./_components/notice-form";

// AJ, 2026-10-04: the green box at the bottom of every kitchen's sidebar.
export default async function SidebarNoticePage() {
  await requireSuperAdminOrRedirect();
  const notice = await getPlatformNotice();
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Platform" }, { label: "Sidebar notice" }]}
        title="Sidebar notice"
        description="The green box at the bottom of every kitchen's sidebar. Switched off, kitchens see the trial countdown during their trial and nothing after it. Switched on, your text and button replace it for every kitchen, including paid ones."
      />
      <NoticeForm initial={{ enabled: notice.enabled, title: notice.title ?? "", message: notice.message ?? "", buttonLabel: notice.buttonLabel ?? "", buttonUrl: notice.buttonUrl ?? "" }} />
    </>
  );
}
