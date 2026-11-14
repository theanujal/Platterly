import { redirect } from "next/navigation";

/** Payments became Subscriptions (AJ, 2026-11-14); the old address still works. */
export default function Page() {
  redirect("/subscriptions");
}
