import { FileText, ImageIcon } from "lucide-react";
import type { ExpenseAttachmentData } from "./expense-dialog";

/** A row's receipts as small links that open the file in a new tab; nothing when there are none. */
export function ExpenseFiles({ attachments }: { attachments?: ExpenseAttachmentData[] }) {
  if (!attachments || attachments.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {attachments.map((a) => {
        const Icon = a.contentType === "application/pdf" ? FileText : ImageIcon;
        return (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" data-testid="expense-file" className="flex max-w-40 items-center gap-1.5 text-sm text-primary hover:underline">
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{a.fileName}</span>
          </a>
        );
      })}
    </div>
  );
}
