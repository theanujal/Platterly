"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CustomerForm, type CustomerFormValues } from "./customer-form";
import { updateCustomerAction } from "../actions";

interface EditCustomerDialogProps {
  customerId: string;
  name: string;
  initialValues: CustomerFormValues;
}

export function EditCustomerDialog({ customerId, name, initialValues }: EditCustomerDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} />}>
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>
        <CustomerForm
          initialValues={initialValues}
          submitLabel="Save changes"
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
