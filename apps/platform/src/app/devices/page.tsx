import { DevicesView } from "@/components/account/views";
import { requireAccountSignIn } from "@/lib/account/guard";

export const metadata = { title: "Devices" };

export default async function Page() {
  await requireAccountSignIn("/devices");
  return <DevicesView />;
}
