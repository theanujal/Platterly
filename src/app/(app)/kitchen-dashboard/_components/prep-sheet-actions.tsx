"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Print and Download PDF for the prep sheet (AJ, 2026-09-30). Both use the
 * same server-made PDF: Download saves it, Print loads it in a hidden frame
 * and opens the browser's print dialog, so the paper copy matches the file.
 */
export function PrepSheetActions({ pdfUrl }: { pdfUrl: string }) {
  function print() {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
    frame.src = pdfUrl;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60_000);
    };
    document.body.appendChild(frame);
  }

  return (
    <>
      <Button variant="outline" onClick={print}>
        <Printer data-icon="inline-start" />
        Print
      </Button>
      <Button variant="outline" render={<a href={`${pdfUrl}?download=1`} download />} nativeButton={false}>
        <Download data-icon="inline-start" />
        Download PDF
      </Button>
    </>
  );
}
