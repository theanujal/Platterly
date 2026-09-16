"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

interface SignOutButtonProps {
  className?: string;
}

export function SignOutButton({ className }: SignOutButtonProps) {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/kitchenlogin");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut} className={cn("gap-2", className)}>
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
