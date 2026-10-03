import { AlertTriangle, Check, CircleCheck, CreditCard, FileText, Receipt, Send, ClipboardCheck, Clock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_VARIANT, type InvoiceDisplayStatus } from "@/modules/invoices/invoice-status";

const STATUS_ICON = { DRAFT: FileText, SENT: Send, PARTIALLY_PAID: CreditCard, PAID: Check, OVERDUE: AlertTriangle, CANCELLED: X } as const;

export function InvoiceStatusBadge({ status }: { status: InvoiceDisplayStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge variant={INVOICE_STATUS_VARIANT[status]}>
      <Icon data-icon="inline-start" />
      {INVOICE_STATUS_LABEL[status]}
    </Badge>
  );
}

export function InvoiceTypeBadge({ type }: { type: "INVOICE" | "RECEIPT" }) {
  const Icon = type === "RECEIPT" ? ClipboardCheck : Receipt;
  return (
    <Badge variant="outline">
      <Icon data-icon="inline-start" />
      {type === "RECEIPT" ? "Receipt" : "Invoice"}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: "PENDING" | "CONFIRMED" | "FAILED" }) {
  if (status === "CONFIRMED")
    return (
      <Badge variant="success">
        <CircleCheck data-icon="inline-start" />
        Confirmed
      </Badge>
    );
  if (status === "FAILED")
    return (
      <Badge variant="danger">
        <X data-icon="inline-start" />
        Failed
      </Badge>
    );
  return (
    <Badge variant="warning">
      <Clock data-icon="inline-start" />
      Awaiting confirmation
    </Badge>
  );
}
