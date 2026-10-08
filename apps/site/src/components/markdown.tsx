import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { slugify } from "@/lib/markdown-meta";

const text = (children: ReactNode): string => (typeof children === "string" ? children : Array.isArray(children) ? children.map(text).join("") : "");

/**
 * Renders a Markdown body with the site's reading styles. Raw HTML in the Markdown is ignored (not rendered), so content
 * that comes from a person or from Platterly Ops later can never inject markup. "##" headings get ids for the contents list.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => <h2 id={slugify(text(children))}>{children}</h2>,
        a: ({ href = "", children }) => (/^(https?:|mailto:|tel:)/.test(href) ? <a href={href}>{children}</a> : <Link href={href}>{children}</Link>),
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
