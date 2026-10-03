# invoices

Owning chunk: Chunk 14 — Billing, Invoicing & Payments.

- `invoice.ts` — `generateInvoiceFromOrder` (lines from the order's own price rules, always totalling the order total), numbering (INV-0001 / RCT-0001 per kitchen), status sync from confirmed payments.
- `invoice-status.ts` — client-safe status rules (Overdue is derived from the due date, never stored) and the inclusive-GST split. Order prices include GST, so GST is carved out of the total.
- `invoice-pdf.ts` — the A4 PDF, with the kitchen's Terms & Conditions at the foot.
- `invoice-send.ts` — "Send invoice" / "Send receipt" through `notify()`; log-only until Chunk 16 connects the email provider.

Credit notes are not built yet (Estimate is the existing Quotation).
