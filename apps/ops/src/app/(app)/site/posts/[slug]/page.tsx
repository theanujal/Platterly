import { notFound } from "next/navigation";
import { listMedia } from "@/modules/site-content/media";
import { getSitePost } from "@/modules/site-content/site-content";
import { deletePostAction } from "../../actions";
import { PostForm } from "../../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getSitePost((await params).slug);
  if (!post) notFound();
  const library = (await listMedia()).map((m) => ({ name: m.name, alt: m.alt }));
  return (
    <div className="grid gap-4">
      <PostForm isNew={false} library={library} values={{ ...post, tags: post.tags.join(", "), metaTitle: post.metaTitle ?? "", metaDescription: post.metaDescription ?? "", ogImage: post.ogImage ?? "", publishAt: post.publishAt ? new Date(post.publishAt.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16) : "" }} />
      <form action={deletePostAction}><input type="hidden" name="slug" value={post.slug} /><button type="submit" className="text-sm text-destructive hover:underline">Delete this post</button></form>
    </div>
  );
}
