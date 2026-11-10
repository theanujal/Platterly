import { NotificationsView } from "@/components/account/views";
import { requireAccountSignIn } from "@/lib/account/guard";

export default async function Page() {
  await requireAccountSignIn("/notifications");
  return <NotificationsView />;
}
