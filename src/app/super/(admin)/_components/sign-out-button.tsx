"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/super");
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="Sign out" onClick={handleSignOut} className="cursor-pointer">
          <LogOut />
          <span>Sign out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
