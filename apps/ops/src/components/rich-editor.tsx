"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Bold, Code2, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Strikethrough, Table2, Undo2, Unlink, type LucideIcon } from "lucide-react";
import { inputClass } from "@/components/ui";

export interface LibraryPicture {
  name: string;
  alt: string;
}

function ToolButton({ title, icon: Icon, on, active, disabled, off }: { title: string; icon: LucideIcon; on: () => void; active?: boolean; disabled?: boolean; off?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled || off} onMouseDown={(e) => e.preventDefault()} onClick={on} className={`flex size-8 items-center justify-center rounded-lg disabled:opacity-40 ${active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}><Icon className="size-4" aria-hidden /></button>
  );
}

/**
 * A WordPress-style writing box: a toolbar over the text as it will read (headings, bold, lists, links, tables, quotes, pictures).
 * What it saves is Markdown, in a hidden field called `name`, so the site (which renders Markdown) and every existing page keep working.
 * "Edit as Markdown" shows and edits the raw text instead.
 */
export function RichEditor({ name, label, initial, library = [], hint }: { name: string; label: string; initial: string; library?: LibraryPicture[]; hint?: string }) {
  const [markdown, setMarkdown] = useState(initial);
  const [raw, setRaw] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } } }),
      Image.configure({ inline: false }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
      Markdown,
    ],
    content: initial,
    contentType: "markdown",
    editorProps: { attributes: { "aria-label": label, role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor: e }) => setMarkdown(e.getMarkdown()),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => e ? { bold: e.isActive("bold"), italic: e.isActive("italic"), strike: e.isActive("strike"), h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }), bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), quote: e.isActive("blockquote"), code: e.isActive("codeBlock"), link: e.isActive("link"), canUndo: e.can().undo(), canRedo: e.can().redo() } : null,
  });

  // Leaving the Markdown view hands what was typed back to the editor.
  const toggleRaw = useCallback(() => {
    if (raw && editor) editor.commands.setContent(markdown, { contentType: "markdown" });
    setRaw((v) => !v);
  }, [raw, editor, markdown]);

  useEffect(() => { if (!problem) return; const t = setTimeout(() => setProblem(null), 6000); return () => clearTimeout(t); }, [problem]);

  async function upload(picked: File | undefined) {
    if (!picked || !editor) return;
    setUploading(true);
    setProblem(null);
    try {
      const body = new FormData();
      body.set("file", picked);
      const response = await fetch("/api/site/media", { method: "POST", body });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "The picture could not be uploaded.");
      editor.chain().focus().setImage({ src: result.url, alt: picked.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ") }).run();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The picture could not be uploaded.");
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }

  function setLink() {
    if (!editor) return;
    const current = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link address (a page such as /catering/, an https:// address or mailto:)", current ?? "https://");
    if (href === null) return;
    if (href.trim() === "") { editor.chain().focus().unsetLink().run(); return; }
    if (!/^(\/(?!\/)|https:\/\/|mailto:|tel:)/.test(href.trim())) { setProblem("A link must start with /, https://, mailto: or tel:."); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  }

  const sep = <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
  const chain = () => editor!.chain().focus();
  const off = !editor || raw;

  return (
    <div className="rich-editor flex flex-col gap-2">
      <input type="hidden" name={name} value={markdown} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <button type="button" onClick={toggleRaw} className="text-[13px] font-medium text-accent-foreground hover:underline">{raw ? "Back to the editor" : "Edit as Markdown"}</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/60 p-1.5">
          <ToolButton title="Heading" icon={Heading2} off={off} active={state?.h2} on={() => chain().toggleHeading({ level: 2 }).run()} />
          <ToolButton title="Subheading" icon={Heading3} off={off} active={state?.h3} on={() => chain().toggleHeading({ level: 3 }).run()} />
          {sep}
          <ToolButton title="Bold" icon={Bold} off={off} active={state?.bold} on={() => chain().toggleBold().run()} />
          <ToolButton title="Italic" icon={Italic} off={off} active={state?.italic} on={() => chain().toggleItalic().run()} />
          <ToolButton title="Strikethrough" icon={Strikethrough} off={off} active={state?.strike} on={() => chain().toggleStrike().run()} />
          {sep}
          <ToolButton title="Bulleted list" icon={List} off={off} active={state?.bullet} on={() => chain().toggleBulletList().run()} />
          <ToolButton title="Numbered list" icon={ListOrdered} off={off} active={state?.ordered} on={() => chain().toggleOrderedList().run()} />
          <ToolButton title="Quote" icon={Quote} off={off} active={state?.quote} on={() => chain().toggleBlockquote().run()} />
          <ToolButton title="Code block" icon={Code2} off={off} active={state?.code} on={() => chain().toggleCodeBlock().run()} />
          {sep}
          <ToolButton title="Add or edit link" icon={Link2} off={off} active={state?.link} on={setLink} />
          <ToolButton title="Remove link" icon={Unlink} off={off} disabled={!state?.link} on={() => chain().unsetLink().run()} />
          <ToolButton title="Upload a picture" icon={ImagePlus} off={off} disabled={uploading} on={() => file.current?.click()} />
          <ToolButton title="Insert a table" icon={Table2} off={off} on={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
          <ToolButton title="Divider" icon={Minus} off={off} on={() => chain().setHorizontalRule().run()} />
          {sep}
          <ToolButton title="Undo" icon={Undo2} off={off} disabled={!state?.canUndo} on={() => chain().undo().run()} />
          <ToolButton title="Redo" icon={Redo2} off={off} disabled={!state?.canRedo} on={() => chain().redo().run()} />
          {library.length > 0 ? (
            <select aria-label="Insert a picture from the library" disabled={raw} value="" onChange={(e) => { const pic = library.find((p) => p.name === e.target.value); if (pic && editor) editor.chain().focus().setImage({ src: `/uploads/${pic.name}`, alt: pic.alt }).run(); }} className={`${inputClass} ml-auto h-8! w-48! text-[13px]`}>
              <option value="">Insert from library…</option>
              {library.map((p) => <option key={p.name} value={p.name}>{p.alt || p.name}</option>)}
            </select>
          ) : null}
        </div>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" aria-label="Picture file" tabIndex={-1} onChange={(e) => upload(e.target.files?.[0])} />
        {raw ? (
          <textarea aria-label={`${label} as Markdown`} value={markdown} onChange={(e) => setMarkdown(e.target.value)} rows={22} className="block w-full resize-y p-4 font-mono text-sm outline-none" />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
      {uploading ? <p role="status" className="text-xs text-muted-foreground">Uploading the picture…</p> : null}
      {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
