import { ProductsView } from "@/components/account/views";
import { requireAccountSignIn } from "@/lib/account/guard";

export const metadata = { title: "My Products" };

export default async function Page() {
  await requireAccountSignIn("/products");
  return <ProductsView />;
}
