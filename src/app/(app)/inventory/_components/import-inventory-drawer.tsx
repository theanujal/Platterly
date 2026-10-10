"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDrawer, DrawerForm } from "@/components/catalog/form-drawer";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { importInventoryItemsAction, type BulkActionResult } from "../actions";
import { BulkResult } from "./bulk-result";

function TemplateLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" render={<a href="/inventory/template?format=xlsx" download />} nativeButton={false}>
        <Download /> Excel template
      </Button>
      <Button variant="outline" size="sm" render={<a href="/inventory/template?format=csv" download />} nativeButton={false}>
        <Download /> CSV template
      </Button>
    </div>
  );
}

export function ImportInventoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<BulkActionResult, { ok: true }> | null>(null);

  function handleClose() {
    setFile(null);
    setError(null);
    setResult(null);
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (result) return handleClose();
    if (!file) return setError("Choose an Excel or CSV file.");
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    const outcome = await importInventoryItemsAction(formData);
    setPending(false);
    if (!outcome.ok) return setError(outcome.error);
    setResult(outcome);
    router.refresh();
  }

  return (
    <FormDrawer open={open} onOpenChange={(o) => !o && handleClose()} title="Import Inventory Items" description="Add your existing ingredient list from an Excel or CSV file." size="md">
      <DrawerForm onSubmit={submit} error={error} pending={pending} submitLabel={result ? "Done" : "Import"} onCancel={handleClose}>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Columns: <strong>Item Name</strong>, Category, <strong>Unit</strong>, Purchase Price, Opening Stock, Low Stock Alert, Storage Location. Opening Stock is optional: items without it start at zero stock. Names already in your Inventory Items are skipped.
          </p>
          <TemplateLinks />
        </div>
        {result ? (
          <BulkResult result={result} />
        ) : (
          <>
            <FileDropzone accept=".xlsx,.csv" caption="Excel (.xlsx) or CSV, up to 4MB and 1000 items" onFilesSelect={(files) => setFile(files[0] ?? null)} />
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
