"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { PRODUCT_COOKIE, listSwitcherProducts } from "@/lib/selected-product";

/** Sets (or, for "all", clears) the product the Ops screens are scoped to. An unknown key is treated as "all". */
export async function switchProductAction(key: string): Promise<void> {
  await requireStaff();
  const jar = await cookies();
  const known = key !== "all" && (await listSwitcherProducts()).some((p) => p.key === key);
  if (known) jar.set(PRODUCT_COOKIE, key, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  else jar.delete(PRODUCT_COOKIE);
  revalidatePath("/", "layout");
}
