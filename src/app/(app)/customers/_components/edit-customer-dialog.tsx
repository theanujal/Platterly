"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDrawer } from "@/components/catalog/form-drawer";
import { CustomerForm, type CustomerFormValues } from "./customer-form";
import { updateCustomerAction } from "../actions";

interface EditCustomerDialogProps {
  customerId: string;
  name: string;
  initialValues: CustomerFormValues;
  /** "header" = the page-level outline square used in the profile header; default is the small ghost pencil. */
  triggerStyle?: "ghost" | "header";
}

export function EditCustomerDialog({ customerId, name, initialValues, triggerStyle = "ghost" }: EditCustomerDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={triggerStyle === "header" ? "outline" : "ghost"}
        size={triggerStyle === "header" ? "icon" : "icon-sm"}
        aria-label={`Edit ${name}`}
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-4" />
      </Button>
      <FormDrawer open={open} onOpenChange={setOpen} title="Edit Customer">
        <CustomerForm
          initialValues={initialValues}
          submitLabel="Save changes"
          notice={
            <p role="note" className="flex items-start gap-2 rounded-lg bg-info/10 p-3 text-sm text-info">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                Saving updates {name} everywhere in Platterly: orders, quotations, abandoned orders, the calendar and every other place this customer appears.
              </span>
            </p>
          }
          onSubmit={(formData) => updateCustomerAction(customerId, formData)}
          onCancel={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </FormDrawer>
    </>
  );
}
