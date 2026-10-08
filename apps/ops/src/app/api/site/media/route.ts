import { NextResponse } from "next/server";
import { getStaff } from "@/lib/session";
import { MAX_MEDIA_BYTES, MediaError, storeMedia } from "@/modules/site-content/media";

export const dynamic = "force-dynamic";

/** POST multipart (`file`): a picture for the website library. Staff only. Answers { name, url }. */
export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_MEDIA_BYTES + 64 * 1024) return NextResponse.json({ error: "Pictures can be at most 4 MB." }, { status: 413 });
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "Send the picture as a file." }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a picture." }, { status: 400 });
  try {
    const row = await storeMedia(new Uint8Array(await file.arrayBuffer()), file.name, staff.id);
    return NextResponse.json({ name: row.name, url: `/uploads/${row.name}` });
  } catch (error) {
    if (error instanceof MediaError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
