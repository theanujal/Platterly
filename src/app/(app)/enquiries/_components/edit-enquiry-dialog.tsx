"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EnquiryForm, type EnquiryFormValues } from "./enquiry-form";
import { updateEnquiryAction } from "../actions";

interface EditEnquiryDialogProps {
  enquiryId: string;
  name: string;
  initialValues: EnquiryFormValues;
  eventTypes: { id: string; name: string }[];
  menus: { id: string; name: string }[];
}

export function EditEnquiryDialog({ enquiryId, name, initialValues, eventTypes, menus }: EditEnquiryDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} />}>
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Enquiry</DialogTitle>
        </DialogHeader>
        <EnquiryForm
          initialValues={initialValues}
          showFullFields
          eventTypes={eventTypes}
          menus={menus}
          submitLabel="Save changes"
          onSubmit={(formData) => updateEnquiryAction(enquiryId, formData)}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
