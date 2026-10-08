import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPage } from "@/lib/content";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "The rules for using Platterly and Catering by Platterly.",
  alternates: { canonical: "/terms/" },
};

/** DRAFT for legal review before launch. The text is in src/content/pages/terms.md. */
export default async function Page() {
  return <ContentPage page={await getPage("terms")} />;
}
