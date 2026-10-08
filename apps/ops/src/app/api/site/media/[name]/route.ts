import { verifyRequest } from "@platterly/contract";
import { getStaff } from "@/lib/session";
import { readMedia } from "@/modules/site-content/media";
import { siteSecret } from "@/modules/site-content/publish";

export const dynamic = "force-dynamic";

/** GET: a library picture. Signed in staff (the editor shows them) or the site build (a request signed with SITE_SECRET over an empty body). */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const secret = siteSecret();
  const signed = secret ? verifyRequest([secret], request.headers, "").ok : false;
  if (!signed && !(await getStaff())) return new Response("Unauthorized", { status: 401 });
  const file = await readMedia((await params).name);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), { headers: { "content-type": file.mime, "content-length": String(file.bytes.length), "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
}
