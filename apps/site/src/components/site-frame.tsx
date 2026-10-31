import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/announcement-bar";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CookieConsent } from "@/components/cookie-consent";
import { getNotice, getScripts } from "@/lib/content";

/** The notice bar, the header, the page, the footer and, the cookie notice while a script needs a choice. */
export async function SiteFrame({ children, announcement = false }: { children: ReactNode; announcement?: boolean }) {
  const notice = announcement ? await getNotice() : null;
  const scripts = await getScripts();
  return (
    <>
      {notice && <AnnouncementBar notice={notice} />}
      <Header />
      <main id="main" className="overflow-x-clip">
        {children}
      </main>
      <Footer cookieSettings={scripts.some((s) => s.kind !== "essential")} />
      <CookieConsent scripts={scripts} />
    </>
  );
}
