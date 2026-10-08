import { notFound } from "next/navigation";
import { getSitePost } from "@/modules/site-content/site-content";
import { deletePostAction } from "../../actions";
import { PostForm } from "../../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getSitePost((await params).slug);
  if (!post) notFound();
  return (
    <div className="grid gap-4">
      <PostForm isNew={false} values={{ ...post, tags: post.tags.join(", ") }} />
      <form action={deletePostAction}><input type="hidden" name="slug" value={post.slug} /><button type="submit" className="text-sm text-destructive hover:underline">Delete this post</button></form>
    </div>
  );
}
