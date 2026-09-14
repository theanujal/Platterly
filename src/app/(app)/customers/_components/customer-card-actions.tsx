import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditCustomerDialog } from "./edit-customer-dialog";
import type { CustomerFormValues } from "./customer-form";

interface CustomerCardActionsProps {
  customerId: string;
  name: string;
  initialValues: CustomerFormValues;
}

/** No delete action here — see customer.ts's comment on why Customer has no hard-delete UI. */
export function CustomerCardActions({ customerId, name, initialValues }: CustomerCardActionsProps) {
  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" aria-label={`View ${name}`} render={<Link href={`/customers/${customerId}`} />} nativeButton={false}>
        <Eye className="size-4" />
      </Button>
      <EditCustomerDialog customerId={customerId} name={name} initialValues={initialValues} />
    </div>
  );
}
