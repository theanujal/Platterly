"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button, type buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import type { VariantProps } from "class-variance-authority";

interface SignOutButtonProps {
  className?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  /** Defaults to "sm" for standalone usage (e.g. the invitation "wrong account" screen) — the sidebar footer passes "default" so it matches every other h-11 nav item. */
  size?: VariantProps<typeof buttonVariants>["size"];
}

export function SignOutButton({ className, variant = "ghost", size = "sm" }: SignOutButtonProps) {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/kitchenlogin");
    router.refresh();
  }

  return (
    <Button variant={variant} size={size} onClick={handleSignOut} className={cn("gap-2", className)}>
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
