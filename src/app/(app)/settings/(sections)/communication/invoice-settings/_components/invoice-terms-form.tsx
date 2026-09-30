"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStopEditing } from "../../../../_components/editable-panel";
import { FormFooter } from "../../../../_components/settings-ui";
import { updateInvoiceTermsAction } from "../../actions";

export function InvoiceTermsForm({ initialTerms }: { initialTerms: string }) {
  const router = useRouter();
  const stopEditing = useStopEditing();
  const [terms, setTerms] = useState(initialTerms);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData();
    formData.set("terms", terms);
    await updateInvoiceTermsAction(formData);
    setPending(false);
    router.refresh();
    stopEditing();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="terms">Terms &amp; Conditions</Label>
        <Textarea
          id="terms"
          className="min-h-40"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="e.g. Payment is due within 15 days of the invoice date. Late payments may incur a 2% monthly fee..."
        />
        {!terms.trim() && <p className="text-xs text-muted-foreground">No custom terms and conditions set. Default invoice formatting will be used.</p>}
      </div>
      <FormFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Terms"}
        </Button>
        <Button type="button" variant="outline" onClick={stopEditing}>
          Cancel
        </Button>
      </FormFooter>
    </form>
  );
}
