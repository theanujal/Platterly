"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateInvoiceTermsAction } from "../../actions";

export function InvoiceTermsForm({ initialTerms }: { initialTerms: string }) {
  const router = useRouter();
  const [terms, setTerms] = useState(initialTerms);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSuccess(false);
    setPending(true);
    const formData = new FormData();
    formData.set("terms", terms);
    await updateInvoiceTermsAction(formData);
    setPending(false);
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="terms">Terms &amp; Conditions</Label>
        <textarea
          id="terms"
          rows={8}
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          className="rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="e.g. Payment is due within 15 days of the invoice date. Late payments may incur a 2% monthly fee..."
        />
      </div>
      <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Writing tips</p>
        <ul className="mt-1 list-disc pl-4">
          <li>State payment due dates and accepted methods clearly.</li>
          <li>Mention any late-payment fees or cancellation policy.</li>
          <li>Keep it short — most customers skim this section.</li>
        </ul>
        <p className="mt-2">This text appears at the bottom of every invoice PDF once invoicing is built.</p>
      </div>
      {success && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
