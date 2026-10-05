import { prisma } from "@/lib/db";
import { Empty, PageHeader } from "@/components/ui";
import { NewBusinessForm } from "./new-business-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New business" };

export default async function NewBusinessPage() {
  const products = await prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { key: true, name: true } });
  return (
    <>
      <PageHeader title="New business" description="Creates the business here with its free trial, then asks the product to set it up. The owner signs in through the product's own sign-up." />
      {products.length === 0 ? <Empty>Register a product first.</Empty> : <NewBusinessForm products={products} />}
    </>
  );
}
