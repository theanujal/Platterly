import Link from "next/link";
import { Badge, Empty, LinkButton, Table } from "@/components/ui";
import { listSitePosts, postCategories } from "@/modules/site-content/site-content";
import { RenameCategoryForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Blog" };

export default async function PostsPage() {
  const [posts, categories] = await Promise.all([listSitePosts(), postCategories()]);
  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Posts</h2>
          <LinkButton href="/site/posts/new" size="md">New post</LinkButton>
        </div>
        {posts.length === 0 ? <Empty>No posts yet.</Empty> : (
          <Table head={["Post", "Categories", "Date"]}>
            {posts.map((p) => (
              <tr key={p.slug}>
                <td><Link className="font-medium text-accent-foreground hover:underline" href={`/site/posts/${p.slug}`}>{p.title}</Link><div className="font-mono text-xs text-muted-foreground">/blog/{p.slug}/</div></td>
                <td><div className="flex flex-wrap gap-1">{p.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div></td>
                <td>{p.date}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
      <section className="grid max-w-3xl gap-3">
        <h2 className="text-base font-semibold">Categories</h2>
        <p className="text-sm text-muted-foreground">Rename or remove a category on every post that has it. To add a category, type it into a post.</p>
        {categories.length === 0 ? <Empty>No categories yet.</Empty> : categories.map((c) => (
          <div key={c.tag} className="flex flex-wrap items-center gap-3"><span className="w-40 text-sm font-medium">{c.tag} <span className="text-muted-foreground">· {c.posts}</span></span><RenameCategoryForm tag={c.tag} /></div>
        ))}
      </section>
    </div>
  );
}
