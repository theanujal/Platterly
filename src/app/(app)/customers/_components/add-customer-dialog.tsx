"use client";

import { useRouter } from "next/navigation";
import { AddDrawer } from "@/components/catalog/form-drawer";
import { CustomerForm } from "./customer-form";
import { createCustomerAction } from "../actions";

export function AddCustomerDialog({ variant = "button" }: { variant?: "button" | "tile" }) {
  const router = useRouter();

  return (
    <AddDrawer variant={variant} buttonLabel="Add Customer" tileLabel="Add New Customer" tileDescription="Add someone you've catered for" title="New Customer">
      {(close) => (
        <CustomerForm
          submitLabel="Create customer"
          onSubmit={createCustomerAction}
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
