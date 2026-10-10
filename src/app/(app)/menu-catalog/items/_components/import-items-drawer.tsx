"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { FormDrawer, DrawerForm } from "@/components/catalog/form-drawer";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { importFoodItemsAction, type BulkActionResult } from "../actions";
import { BulkResult } from "./bulk-result";
import { TemplateLinks } from "./add-item-menu";

export function ImportItemsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<BulkActionResult, { ok: true }> | null>(null);

  function reset() {
    setFile(null);
    setError(null);
    setResult(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (result) return handleClose();
    if (!file) return setError("Choose an Excel or CSV file.");
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    const outcome = await importFoodItemsAction(formData);
    setPending(false);
    if (!outcome.ok) return setError(outcome.error);
    setResult(outcome);
    router.refresh();
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <FormDrawer open={open} onOpenChange={(o) => !o && handleClose()} title="Import Food Items" description="Add many dishes at once from an Excel or CSV file." size="md">
      <DrawerForm onSubmit={submit} error={error} pending={pending} submitLabel={result ? "Done" : "Import"} onCancel={handleClose}>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Columns: <strong>Item Name</strong>, Category, <strong>Veg / Non-Veg</strong>, Price, Description. Names already in your Food Items are skipped, and prices left blank become ₹0.
          </p>
          <TemplateLinks />
        </div>
        {result ? (
          <BulkResult result={result} />
        ) : (
          <>
            <FileDropzone
              accept=".xlsx,.csv"
              caption="Excel (.xlsx) or CSV, up to 4MB and 1000 items"
              onFilesSelect={(files) => setFile(files[0] ?? null)}
            />
            {file && (
              <p className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="size-4 text-muted-foreground" /> {file.name}
              </p>
            )}
          </>
        )}
      </DrawerForm>
    </FormDrawer>
  );
}
