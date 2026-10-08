import { PostForm } from "../../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "New post" };

export default function NewPostPage() {
  return <PostForm isNew values={{ slug: "", title: "", excerpt: "", date: new Date().toISOString().slice(0, 10), author: "The Platterly team", tags: "", colourway: "sunrise", body: "" }} />;
}
