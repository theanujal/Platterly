import { handleBillingProfileGet, handleBillingProfilePut } from "@/modules/platform-list/platform-billing-profile";

export const dynamic = "force-dynamic";

/** GET: a business's saved billing details for the Platform (read-only secret). */
export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  return handleBillingProfileGet(request, (await params).businessId);
}

/** PUT: the Admin's edit from the Account, passed on by the Platform (billing secret). */
export async function PUT(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  return handleBillingProfilePut(request, (await params).businessId);
}
