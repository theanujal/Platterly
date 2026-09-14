"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TenantProfileForm, type TenantProfileFormValues } from "../../_components/tenant-profile-form";
import { updateTenantAction } from "../../actions";

interface EditTenantDialogProps {
  tenantId: string;
  initialValues: Omit<TenantProfileFormValues, "slug">;
}

export function EditTenantDialog({ tenantId, initialValues }: EditTenantDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Edit</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit caterer profile</DialogTitle>
        </DialogHeader>
        <TenantProfileForm
          initialValues={initialValues}
          submitLabel="Save changes"
          onSubmit={(values) =>
            updateTenantAction(tenantId, {
              name: values.name,
              ownerFirstName: values.ownerFirstName,
              ownerLastName: values.ownerLastName,
              contactPhone: values.contactPhone,
              contactEmail: values.contactEmail,
              gstNumber: values.gstNumber,
              addressLine1: values.addressLine1,
              addressLine2: values.addressLine2,
              city: values.city,
              state: values.state,
              postalCode: values.postalCode,
              country: values.country,
            })
          }
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
