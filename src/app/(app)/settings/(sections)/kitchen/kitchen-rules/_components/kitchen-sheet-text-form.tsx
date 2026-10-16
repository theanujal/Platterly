"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStopEditing } from "../../../../_components/editable-panel";
import { FormFooter } from "../../../../_components/settings-ui";
import { updateKitchenSheetTextAction } from "../actions";
import type { KitchenSheetText } from "@/modules/kitchen/sheet-text";
import { toast } from "@/components/ui/toaster";

/** The two free-text blocks of the kitchen order PDF: one point per line, numbered on the printed sheet. */
export function KitchenSheetTextForm({ initialValues }: { initialValues: KitchenSheetText }) {
  const router = useRouter();
  const stopEditing = useStopEditing();
  const [serviceIncludes, setServiceIncludes] = useState(initialValues.serviceIncludes);
  const [pleaseNote, setPleaseNote] = useState(initialValues.pleaseNote);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("serviceIncludes", serviceIncludes);
    formData.set("pleaseNote", pleaseNote);
    const result = await updateKitchenSheetTextAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("Kitchen order sheet text saved.");
    router.refresh();
    stopEditing();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sheet-service">Service Also Include</Label>
        <Textarea id="sheet-service" rows={8} maxLength={3000} value={serviceIncludes} onChange={(e) => setServiceIncludes(e.target.value)} placeholder={"Staff for service\nMelamine plates"} />
        <p className="text-xs text-muted-foreground">One point per line. Printed on every kitchen order, numbered. The meal&apos;s add-ons and live counters are added after these. Leave empty to leave it out.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sheet-note">Please Note</Label>
        <Textarea id="sheet-note" rows={8} maxLength={3000} value={pleaseNote} onChange={(e) => setPleaseNote(e.target.value)} placeholder={"We do not provide tables and chairs for seating."} />
        <p className="text-xs text-muted-foreground">One point per line. Printed on every kitchen order, numbered. Leave empty to leave it out.</p>
      </div>
      <FormFooter error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={stopEditing}>
          Cancel
        </Button>
      </FormFooter>
    </form>
  );
}
