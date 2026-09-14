import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, MapPin, Phone, ClipboardList, CalendarRange } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getCustomer, getCustomerTimeline } from "@/modules/customers/customer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EditCustomerDialog } from "../_components/edit-customer-dialog";
import type { CustomerFormValues } from "../_components/customer-form";

export const metadata: Metadata = {
  title: "Customer — Platterly",
  robots: { index: false, follow: false },
};

const ENQUIRY_STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUOTATION_SENT: "Quotation Sent",
  FOLLOW_UP: "Follow-up",
  CONVERTED: "Converted",
  LOST: "Lost",
};

const EVENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["view"] }, organizationId);
  const [customer, timeline] = await Promise.all([getCustomer(organizationId, id), getCustomerTimeline(organizationId, id)]);
  if (!customer) notFound();

  const initialValues: CustomerFormValues = {
    name: customer.name,
    phone: customer.phone,
    email: customer.email ?? "",
    addressLine1: customer.addressLine1 ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    notes: customer.notes ?? "",
    isActive: customer.isActive,
  };

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div>
        <Link href="/customers" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
          <ArrowLeft className="size-3" />
          Back to Customers
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{customer.name}</h1>
            {!customer.isActive && <Badge variant="secondary">Inactive</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Phone className="size-3.5" />
              {customer.phone}
            </span>
            {customer.email && (
              <span className="flex items-center gap-1">
                <Mail className="size-3.5" />
                {customer.email}
              </span>
            )}
            {(customer.city || customer.state) && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {[customer.addressLine1, customer.city, customer.state].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>
        <EditCustomerDialog customerId={customer.id} name={customer.name} initialValues={initialValues} />
      </div>

      {customer.notes && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">{customer.notes}</CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No enquiries or events yet for this customer.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {timeline.map((entry) => (
              <Card key={`${entry.type}-${entry.id}`}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {entry.type === "enquiry" ? (
                      <ClipboardList className="size-4 text-muted-foreground" />
                    ) : (
                      <CalendarRange className="size-4 text-muted-foreground" />
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {entry.type === "enquiry" ? `Enquiry${entry.eventTypeName ? ` — ${entry.eventTypeName}` : ""}` : entry.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{entry.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {entry.type === "enquiry" ? ENQUIRY_STATUS_LABEL[entry.status] : EVENT_STATUS_LABEL[entry.status]}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
