"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          triggerStyle === "header" ? (
            <Button variant="outline" size="icon" aria-label={`Edit ${name}`} />
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} />
          )
        }
      >
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>
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
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
