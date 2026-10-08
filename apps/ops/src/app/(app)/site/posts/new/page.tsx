import { listMedia } from "@/modules/site-content/media";
import { PostForm } from "../../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "New post" };

export default async function NewPostPage() {
  const library = (await listMedia()).map((m) => ({ name: m.name, alt: m.alt }));
  return <PostForm isNew library={library} values={{ slug: "", title: "", excerpt: "", date: new Date().toISOString().slice(0, 10), author: "The Platterly team", tags: "", colourway: "sunrise", body: "", metaTitle: "", metaDescription: "", ogImage: "", status: "PUBLISHED", publishAt: "" }} />;
}
