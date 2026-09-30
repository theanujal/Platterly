"use client";

import { useRouter } from "next/navigation";
import { AddDrawer } from "@/components/catalog/form-drawer";
import { AddOnForm } from "./addon-form";
import { createAddOnAction } from "../actions";

export function AddAddOnDialog({ variant = "button" }: { variant?: "button" | "tile" }) {
  const router = useRouter();

  return (
    <AddDrawer variant={variant} buttonLabel="Add Add-on" tileLabel="Add New Add-on" tileDescription="Live counters and special extras" title="New Add-on">
      {(close) => (
        <AddOnForm
          submitLabel="Create add-on"
          onSubmit={createAddOnAction}
          onCancel={close}
          onSuccess={() => {
            close();
            router.refresh();
          }}
        />
      )}
    </AddDrawer>
  );
}
