import { ProfileView } from "@/components/account/views";
import { requireAccountHost } from "@/lib/account/guard";

export default async function Page() {
  await requireAccountHost();
  return <ProfileView />;
}
