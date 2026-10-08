import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/announcement-bar";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { getNotice } from "@/lib/content";

/** The notice bar, the header, the page and the footer. */
export async function SiteFrame({ children, announcement = false }: { children: ReactNode; announcement?: boolean }) {
  const notice = announcement ? await getNotice() : null;
  return (
    <>
      {notice && <AnnouncementBar notice={notice} />}
      <Header />
      <main id="main" className="overflow-x-clip">
        {children}
      </main>
      <Footer />
    </>
  );
}
