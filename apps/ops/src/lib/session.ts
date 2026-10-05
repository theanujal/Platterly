import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export interface Staff {
  id: string;
  name: string;
  email: string;
}

/** The signed-in ops staff member, or null. */
export async function getStaff(): Promise<Staff | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

/** Pages and actions call this first. Not signed in: go to the sign-in page. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/sign-in");
  return staff;
}
