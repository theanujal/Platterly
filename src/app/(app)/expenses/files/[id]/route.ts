import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { readExpenseAttachment } from "@/modules/expenses/attachment";

/** A receipt or bill kept with an expense, only for a signed-in member of its kitchen who can see expenses (#99). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ expenses: ["view"] }, organizationId);
  const file = await readExpenseAttachment(organizationId, id);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
