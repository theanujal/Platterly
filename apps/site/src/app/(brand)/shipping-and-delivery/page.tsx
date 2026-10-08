import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPage } from "@/lib/content";

export const metadata: Metadata = {
  title: "Shipping and Delivery",
  description: "Platterly is software delivered online: how you get access and when it starts.",
  alternates: { canonical: "/shipping-and-delivery/" },
};

/** DRAFT for legal review before launch. The text is in src/content/pages/shipping-and-delivery.md. */
export default async function Page() {
  return <ContentPage page={await getPage("shipping-and-delivery")} />;
}
