import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPage } from "@/lib/content";

export const metadata: Metadata = {
  title: "Cancellation and Refund Policy",
  description: "How plans, cancellation, pausing and refunds work.",
  alternates: { canonical: "/refund/" },
};

/** DRAFT for legal review before launch. The text is in src/content/pages/refund.md. */
export default async function Page() {
  return <ContentPage page={await getPage("refund")} />;
}
