import { ProfileView } from "@/components/account/views";
import { requireAccountSignIn } from "@/lib/account/guard";

export const metadata = { title: "My Profile" };

export default async function Page() {
  await requireAccountSignIn("/profile");
  return <ProfileView />;
}
