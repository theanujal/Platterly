import { SecurityView } from "@/components/account/views";
import { requireAccountSignIn } from "@/lib/account/guard";

export default async function Page() {
  await requireAccountSignIn("/security");
  return <SecurityView />;
}
