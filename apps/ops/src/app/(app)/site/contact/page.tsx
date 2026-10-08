import { getSiteContact } from "@/modules/site-content/site-content";
import { ContactForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact information" };

export default async function ContactPage() {
  const c = await getSiteContact();
  return (
    <>
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">Shown on the Contact page and used by the contact forms. Anything left empty is not shown.</p>
      <ContactForm values={{ ...c, hours: c.hours.join("\n"), addressLines: c.addressLines.join("\n") }} />
    </>
  );
}
