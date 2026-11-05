import { BusinessView } from "@/components/account/views";
import { requireAccountHost } from "@/lib/account/guard";

export default async function Page() {
  await requireAccountHost();
  return <BusinessView />;
}
