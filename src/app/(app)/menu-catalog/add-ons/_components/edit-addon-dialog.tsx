"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AddOnForm, type AddOnFormValues } from "./addon-form";
import { updateAddOnAction } from "../actions";

interface EditAddOnDialogProps {
  addOnId: string;
  name: string;
  initialValues: AddOnFormValues;
}

export function EditAddOnDialog({ addOnId, name, initialValues }: EditAddOnDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} />}>
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Add-on</DialogTitle>
        </DialogHeader>
        <AddOnForm
          initialValues={initialValues}
          submitLabel="Save changes"
          onSubmit={(formData) => updateAddOnAction(addOnId, initialValues.imageUrl ?? undefined, formData)}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
