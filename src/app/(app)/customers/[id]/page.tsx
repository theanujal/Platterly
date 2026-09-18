import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, ShoppingCart, CalendarRange } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getCustomer, getCustomerTimeline } from "@/modules/customers/customer";
import { formatPhoneDisplay } from "@/lib/phone";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EditCustomerDialog } from "../_components/edit-customer-dialog";
import type { CustomerFormValues } from "../_components/customer-form";

export const metadata: Metadata = {
  title: "Customer — Platterly",
  robots: { index: false, follow: false },
};

const LEAD_SOURCE_LABEL: Record<string, string> = {
  MANUAL_ENTRY: "Manual Entry",
  REFERRAL: "Referral",
  WEBSITE: "Website",
  SOCIAL_MEDIA: "Social Media",
  ADVERTISEMENT: "Advertisement",
  COLD_CALL: "Cold Call",
  NETWORKING: "Networking",
  OTHER: "Other",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  IN_PREPARATION: "In Preparation",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
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
    notes: customer.notes ?? "",
    isActive: customer.isActive,
    isEnquiry: customer.isEnquiry,
    leadSource: customer.leadSource ?? "MANUAL_ENTRY",
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
            <Badge variant={customer.status === "CUSTOMER" ? "success" : "neutral"}>
              {customer.status === "CUSTOMER" ? "Customer" : "Lead"}
            </Badge>
            {!customer.isActive && <Badge variant="neutral">Inactive</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Phone className="size-3.5" />
              {formatPhoneDisplay(customer.phone)}
            </span>
            {customer.email && (
              <span className="flex items-center gap-1">
                <Mail className="size-3.5" />
                {customer.email}
              </span>
            )}
          </div>
        </div>
        <EditCustomerDialog customerId={customer.id} name={customer.name} initialValues={initialValues} />
      </div>

      {customer.isEnquiry && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Lead Information</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Source:</span>
              <Badge variant="outline">{LEAD_SOURCE_LABEL[customer.leadSource ?? ""] ?? "—"}</Badge>
            </div>
            {customer.notes && <p className="text-sm text-muted-foreground">{customer.notes}</p>}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders or events yet for this customer.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {timeline.map((entry) => (
              <Card key={`${entry.type}-${entry.id}`}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {entry.type === "order" ? (
                      <ShoppingCart className="size-4 text-muted-foreground" />
                    ) : (
                      <CalendarRange className="size-4 text-muted-foreground" />
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{entry.type === "order" ? (entry.orderNumber ?? "Order") : entry.name}</span>
                      <span className="text-xs text-muted-foreground">{entry.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {entry.type === "order" ? (ORDER_STATUS_LABEL[entry.status] ?? entry.status) : (EVENT_STATUS_LABEL[entry.status] ?? entry.status)}
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
